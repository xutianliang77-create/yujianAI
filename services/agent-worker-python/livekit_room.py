"""Optional official LiveKit Python RTC adapter for an Agent worker.

The base worker intentionally stays dependency-light. Deployments that enable
this adapter install the pinned LiveKit Agents package and inject the issued
room token; this module never creates tokens or reads API secrets.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AgentRoomJoinRequest:
    dispatch_id: str
    room_url: str
    token: str
    auto_subscribe: bool = True
    dynacast: bool = False


@dataclass
class AgentRoomSession:
    dispatch_id: str
    room: Any
    _connector: "LiveKitAgentRoomConnector"

    async def close(self) -> None:
        await self._connector.leave(self.dispatch_id)


class LiveKitAgentRoomConnector:
    """Join/leave boundary backed by the official ``livekit.rtc.Room`` API."""

    def __init__(self, rtc_module: Any | None = None) -> None:
        self._rtc = rtc_module
        self._sessions: dict[str, AgentRoomSession] = {}

    async def join(
        self,
        request: AgentRoomJoinRequest,
        cancel_event: asyncio.Event | None = None,
    ) -> AgentRoomSession:
        self._validate(request)
        if request.dispatch_id in self._sessions:
            raise ValueError("dispatch already has a LiveKit Room session")
        rtc = self._load_rtc()
        room = rtc.Room()
        options = rtc.RoomOptions(
            auto_subscribe=request.auto_subscribe,
            dynacast=request.dynacast,
        )
        connect_task = asyncio.create_task(room.connect(request.room_url, request.token, options=options))
        cancel_task: asyncio.Task[bool] | None = None
        try:
            if cancel_event is None:
                await connect_task
            else:
                cancel_task = asyncio.create_task(cancel_event.wait())
                done, _ = await asyncio.wait({connect_task, cancel_task}, return_when=asyncio.FIRST_COMPLETED)
                if cancel_task in done and cancel_task.result():
                    connect_task.cancel()
                    await asyncio.gather(connect_task, return_exceptions=True)
                    await room.disconnect()
                    raise asyncio.CancelledError
                await connect_task
            if cancel_event is not None and cancel_event.is_set():
                await room.disconnect()
                raise asyncio.CancelledError
            session = AgentRoomSession(request.dispatch_id, room, self)
            self._sessions[request.dispatch_id] = session
            return session
        except BaseException:
            if room.isconnected():
                await room.disconnect()
            raise
        finally:
            if cancel_task is not None:
                cancel_task.cancel()
                await asyncio.gather(cancel_task, return_exceptions=True)

    async def leave(self, dispatch_id: str) -> bool:
        session = self._sessions.pop(dispatch_id, None)
        if session is None:
            return False
        if session.room.isconnected():
            await session.room.disconnect()
        return True

    def active_dispatch_ids(self) -> tuple[str, ...]:
        return tuple(self._sessions)

    def _load_rtc(self) -> Any:
        if self._rtc is not None:
            return self._rtc
        try:
            from livekit import rtc
        except ImportError as error:
            raise RuntimeError("install pinned livekit-agents before enabling the Python Room adapter") from error
        self._rtc = rtc
        return rtc

    @staticmethod
    def _validate(request: AgentRoomJoinRequest) -> None:
        if not request.dispatch_id or len(request.dispatch_id) > 128:
            raise ValueError("dispatch_id is invalid")
        if not request.room_url or not request.token:
            raise ValueError("room_url and token are required")


# Public Yujian name; the LiveKit name remains an explicit upstream compatibility boundary.
YujianAgentRoomConnector = LiveKitAgentRoomConnector
