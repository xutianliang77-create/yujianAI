from datetime import datetime, timedelta, timezone

dispatch = {
    "dispatchId": "dispatch-example",
    "roomName": "quickstart",
    "deadlineAt": (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat(),
    "traceId": "trace-example",
}
print(dispatch)
