"""Deferred Beelink smoke for the official livekit.rtc Python API.

The runner deliberately accepts an already-issued short-lived token. It never
creates tokens, reads API secrets, or writes media payloads to the report.
"""
from __future__ import annotations

import asyncio
import os
import sys


async def run() -> None:
    room_url = os.environ.get("YUJIAN_PYTHON_RTC_URL")
    token = os.environ.get("YUJIAN_PYTHON_RTC_TOKEN")
    if not room_url or not token:
        raise RuntimeError("YUJIAN_PYTHON_RTC_URL and YUJIAN_PYTHON_RTC_TOKEN are required")

    try:
        from livekit import rtc
    except ImportError as error:  # pragma: no cover - exercised on the declared runner
        raise RuntimeError("install the pinned livekit-agents package before the Python smoke") from error

    room = rtc.Room()
    options = rtc.RoomOptions(auto_subscribe=True, dynacast=False)
    try:
        await room.connect(room_url, token, options=options)
        if not room.isconnected():
            raise RuntimeError("Python Room did not become connected")
        print("YUJIAN_PYTHON_COMPAT_CONNECTED status=connected", flush=True)
    finally:
        if room.isconnected():
            await room.disconnect()
    print("YUJIAN_PYTHON_COMPAT_PASSED join_leave=passed", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except Exception as error:  # noqa: BLE001 - stable CLI failure boundary
        print(f"YUJIAN_PYTHON_COMPAT_FAILED: {error}", file=sys.stderr, flush=True)
        raise
