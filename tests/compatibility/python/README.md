# Python server/agent compatibility target (deferred)

Pin the official LiveKit Agents/Python package from the upstream manifest. Cover token verification,
Agent dispatch, the `services/agent-worker-python/livekit_room.py` Room join adapter, audio track
lifecycle, deadline/cancel and provider failure. No Python dependency installation or execution is
performed on the Mac workspace in this phase.

## Beelink smoke entry

The first executable target is the official `livekit.rtc.Room` join/leave boundary. Run it only on
the declared Beelink/Python runner with a short-lived token issued by the platform acceptance setup:

```bash
cd /home/beelink/yujianAI
python3 -m venv /tmp/yujian-python-compat
source /tmp/yujian-python-compat/bin/activate
python -m pip install --requirement services/agent-worker-python/requirements.txt
export YUJIAN_PYTHON_RTC_URL=ws://127.0.0.1:7880
export YUJIAN_PYTHON_RTC_TOKEN='<short-lived-token>'
python tests/compatibility/python/room_smoke.py
```

The smoke output is not a full Python Agent Gate: dispatch, audio lifecycle, deadline/cancel and
provider failure still require the Agent Control runtime and a deployment-owned handler.
