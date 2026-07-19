"""Minimal Python worker lifecycle reference; provider and LiveKit joins are adapters."""
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import signal
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Awaitable, Callable


@dataclass(frozen=True)
class AgentJob:
    dispatch_id: str
    room_name: str
    deadline_at: str
    trace_id: str


class WorkerControlError(RuntimeError):
    pass


class WorkerControlClient:
    def __init__(self, base_url: str, credential: str, timeout: float = 5.0) -> None:
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme != "https" and parsed.hostname not in {"127.0.0.1", "localhost"}:
            raise ValueError("worker control URL must use HTTPS outside loopback")
        if len(credential) < 32:
            raise ValueError("worker control credential is too short")
        self.base_url = base_url.rstrip("/")
        self.credential = credential
        self.timeout = timeout

    async def register(self, worker_id: str, environment_id: str, capabilities: list[str]) -> object:
        return await self._post("/internal/v1/agent-workers/register", {"workerId": worker_id, "environmentId": environment_id, "runtime": "python", "capabilities": capabilities})

    async def heartbeat(self, worker_id: str, active_dispatch_ids: list[str]) -> object:
        return await self._post("/internal/v1/agent-workers/heartbeat", {"workerId": worker_id, "activeDispatchIds": active_dispatch_ids})

    async def start(self, worker_id: str, dispatch_id: str) -> object:
        return await self._post("/internal/v1/agent-workers/start", {"workerId": worker_id, "dispatchId": dispatch_id})

    async def complete(self, worker_id: str, dispatch_id: str) -> object:
        return await self._post("/internal/v1/agent-workers/complete", {"workerId": worker_id, "dispatchId": dispatch_id})

    async def fail(self, worker_id: str, dispatch_id: str, reason: str) -> object:
        return await self._post("/internal/v1/agent-workers/fail", {"workerId": worker_id, "dispatchId": dispatch_id, "reason": reason})

    async def cancel(self, worker_id: str, dispatch_id: str) -> object:
        return await self._post("/internal/v1/agent-workers/cancel", {"workerId": worker_id, "dispatchId": dispatch_id})

    async def claim(self, worker_id: str) -> object:
        """Atomically claim the earliest queued dispatch for this worker environment."""
        return await self._post("/internal/v1/agent-workers/claim", {"workerId": worker_id})

    async def _post(self, path: str, body: dict[str, object]) -> object:
        payload = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(f"{self.base_url}{path}", data=payload, method="POST", headers={"accept": "application/json", "content-type": "application/json", "x-yujian-worker-token": self.credential})
        try:
            response = await asyncio.to_thread(urllib.request.urlopen, request, timeout=self.timeout)
            content = response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError) as error:
            raise WorkerControlError("worker control request failed") from error
        if response.status < 200 or response.status >= 300:
            raise WorkerControlError(f"worker control returned HTTP {response.status}")
        try:
            return json.loads(content)
        except json.JSONDecodeError as error:
            raise WorkerControlError("worker control response is not JSON") from error


class AgentWorker:
    def __init__(self) -> None:
        self.draining = False
        self.active: set[str] = set()
        self.tasks: dict[str, asyncio.Task[object]] = {}

    def cancel(self, dispatch_id: str) -> bool:
        if dispatch_id not in self.active:
            return False
        task = self.tasks.get(dispatch_id)
        if task is not None:
            task.cancel()
        self.active.discard(dispatch_id)
        return True

    async def drain(self, timeout: float = 30.0) -> None:
        self.draining = True
        deadline = asyncio.get_running_loop().time() + timeout
        while self.active and asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(0.05)
        for dispatch_id in list(self.active):
            self.cancel(dispatch_id)
        self.active.clear()


class AgentDispatchRunner:
    """Python claim/execute/complete-fail loop; the handler owns LiveKit/provider work."""

    def __init__(
        self,
        worker: AgentWorker,
        control: WorkerControlClient,
        worker_id: str,
        handler: Callable[[dict[str, object]], Awaitable[None]],
    ) -> None:
        self.worker = worker
        self.control = control
        self.worker_id = worker_id
        self.handler = handler
        self.stopping = False

    async def run_once(self) -> bool:
        if self.worker.draining:
            return False
        response = await self.control.claim(self.worker_id)
        if not isinstance(response, dict) or not isinstance(response.get("data"), dict):
            return False
        dispatch = response["data"]
        assert isinstance(dispatch, dict)
        dispatch_id = dispatch.get("dispatchId")
        deadline_at = dispatch.get("deadlineAt")
        if not isinstance(dispatch_id, str) or not isinstance(deadline_at, str):
            raise WorkerControlError("worker control returned an invalid dispatch")
        try:
            deadline = _deadline_seconds(deadline_at)
        except WorkerControlError as error:
            await self.control.fail(self.worker_id, dispatch_id, str(error)[:256])
            return True
        self.worker.active.add(dispatch_id)
        handler_task = asyncio.create_task(self.handler(dispatch))
        self.worker.tasks[dispatch_id] = handler_task
        try:
            async with asyncio.timeout(deadline):
                await handler_task
            await self.control.complete(self.worker_id, dispatch_id)
        except asyncio.CancelledError:
            await self.control.fail(self.worker_id, dispatch_id, "dispatch cancelled")
        except Exception:
            await self.control.fail(self.worker_id, dispatch_id, "dispatch handler failed")
        finally:
            self.worker.tasks.pop(dispatch_id, None)
            self.worker.active.discard(dispatch_id)
        return True

    async def run_loop(self, poll_seconds: float = 0.5) -> None:
        if poll_seconds < 0.1 or poll_seconds > 30.0:
            raise ValueError("poll_seconds must be between 0.1 and 30")
        self.stopping = False
        while not self.stopping:
            try:
                claimed = await self.run_once()
            except WorkerControlError:
                claimed = False
            if not claimed:
                await asyncio.sleep(poll_seconds)

    def stop(self) -> None:
        self.stopping = True


def load_dispatch_handler(path: str) -> Callable[[dict[str, object]], Awaitable[None]]:
    """Load deployment-owned async handler without importing provider secrets here."""
    if path.strip() == "":
        raise WorkerControlError("agent handler module path is empty")
    module_spec = importlib.util.spec_from_file_location("yujian_agent_handler", path)
    if module_spec is None or module_spec.loader is None:
        raise WorkerControlError("agent handler module cannot be loaded")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    candidate = getattr(module, "handle_dispatch", None)
    if not callable(candidate):
        raise WorkerControlError("agent handler module must export handle_dispatch")
    return candidate


def _deadline_seconds(deadline_at: str) -> float:
    parsed = datetime.fromisoformat(deadline_at.replace("Z", "+00:00"))
    now = datetime.now(parsed.tzinfo)
    remaining = (parsed - now).total_seconds()
    if remaining <= 0:
        raise WorkerControlError("dispatch deadline elapsed")
    return remaining


async def main() -> None:
    worker = AgentWorker()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for name in ("SIGINT", "SIGTERM"):
        loop.add_signal_handler(getattr(signal, name), stop.set)
    control_url = os.environ.get("YUJIAN_AGENT_CONTROL_URL")
    control_credential = os.environ.get("YUJIAN_AGENT_CONTROL_CREDENTIAL")
    environment_id = os.environ.get("YUJIAN_AGENT_ENVIRONMENT_ID")
    heartbeat_task: asyncio.Task[None] | None = None
    dispatch_task: asyncio.Task[None] | None = None
    runner: AgentDispatchRunner | None = None
    if control_url and control_credential and environment_id:
        control = WorkerControlClient(control_url, control_credential)
        worker_id = f"worker-python-{os.getpid()}"
        capabilities = [item for item in os.environ.get("YUJIAN_AGENT_CAPABILITIES", "").split(",") if item]
        try:
            await control.register(worker_id, environment_id, capabilities[:64])
        except WorkerControlError:
            pass

        handler_path = os.environ.get("YUJIAN_AGENT_HANDLER_MODULE")
        if handler_path:
            handler = load_dispatch_handler(handler_path)
            runner = AgentDispatchRunner(worker, control, worker_id, handler)
            dispatch_task = asyncio.create_task(runner.run_loop())

        async def heartbeat() -> None:
            while not stop.is_set():
                try:
                    result = await control.heartbeat(worker_id, sorted(worker.active))
                    if isinstance(result, dict) and isinstance(result.get("cancelDispatchIds"), list):
                        for dispatch_id in result["cancelDispatchIds"]:
                            if isinstance(dispatch_id, str):
                                worker.cancel(dispatch_id)
                except WorkerControlError:
                    pass
                try:
                    await asyncio.wait_for(stop.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    continue

        heartbeat_task = asyncio.create_task(heartbeat())
    await stop.wait()
    if heartbeat_task is not None:
        heartbeat_task.cancel()
    if dispatch_task is not None:
        if runner is not None:
            runner.stop()
        dispatch_task.cancel()
        await asyncio.gather(dispatch_task, return_exceptions=True)
    await worker.drain()


if __name__ == "__main__":
    asyncio.run(main())
