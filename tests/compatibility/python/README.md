# Python server/agent compatibility target (deferred)

Pin the official LiveKit Agents/Python package from the upstream manifest. Cover token verification,
Agent dispatch, the `services/agent-worker-python/livekit_room.py` Room join adapter, audio track
lifecycle, deadline/cancel and provider failure. No Python dependency installation or execution is
performed on the Mac workspace in this phase.
