const dispatch = {
  dispatchId: "dispatch-example",
  roomName: "quickstart",
  deadlineAt: new Date(Date.now() + 30_000).toISOString(),
  traceId: "trace-example",
};
console.log(JSON.stringify({ event: "agent.quickstart.dispatch", dispatch }));
