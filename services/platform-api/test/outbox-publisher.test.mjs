import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { OutboxPublisher } from "../dist/outbox-publisher.js";

function event(eventId = `event-${randomUUID()}`) {
  return {
    eventId,
    aggregateType: "audit",
    aggregateId: "audit-1",
    eventType: "yujian.audit.recorded.v1",
    schemaVersion: "1.0",
    producer: "platform-api",
    tenantId: "tenant-1",
    projectId: "project-1",
    environmentId: "environment-1",
    resource: { type: "audit", id: "audit-1" },
    payload: { result: "success" },
    occurredAt: new Date().toISOString(),
    dedupeKey: `audit:${eventId}`,
    attemptCount: 0,
  };
}

async function withHttpServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("OutboxPublisher signs and delivers webhook events", async () => {
  const secret = Buffer.alloc(32, 7);
  const successfulEvent = event("event-success");
  const delivered = new Promise((resolve, reject) => {
    void withHttpServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        eventId: request.headers["x-yujian-event-id"],
        signature: request.headers["x-yujian-signature"],
      });
      response.writeHead(204).end();
    }, async (url) => {
      const published = [];
      const result = await new OutboxPublisher(
        {
          claimOutbox: async () => [successfulEvent],
          markOutboxPublished: async (eventId) => published.push(eventId),
        },
        [{ destinationId: "destination-1", url, secret, eventTypes: ["yujian.audit.recorded.v1"] }],
        { maxAttempts: 1, timeoutMs: 500 },
      ).publishBatch();
      assert.deepEqual(result, { published: 1, failed: 0 });
      assert.deepEqual(published, ["event-success"]);
    }).catch(reject);
  });
  const received = await delivered;
  const expectedBody = JSON.stringify(successfulEvent);
  assert.equal(received.body, expectedBody);
  assert.equal(received.eventId, "event-success");
  assert.equal(
    received.signature,
    `sha256=${createHmac("sha256", secret).update(expectedBody).digest("hex")}`,
  );
});

test("OutboxPublisher records terminal failures and supports requeue", async () => {
  const failedEvent = event("event-failure");
  const failed = [];
  const requeued = [];
  const publisher = new OutboxPublisher(
    {
      claimOutbox: async () => [failedEvent],
      markOutboxFailed: async (eventId, error, nextAttemptAt, deadLetteredAt) => {
        failed.push({ eventId, error, nextAttemptAt, deadLetteredAt });
      },
      requeueOutbox: async (eventId) => requeued.push(eventId),
    },
    [{
      destinationId: "destination-1",
      url: "http://127.0.0.1:1/unreachable",
      secret: Buffer.alloc(32, 9),
      eventTypes: ["yujian.audit.recorded.v1"],
    }],
    { maxAttempts: 1, timeoutMs: 100 },
  );

  const result = await publisher.publishBatch();
  assert.deepEqual(result, { published: 0, failed: 1 });
  assert.equal(failed.length, 1);
  assert.equal(failed[0].eventId, "event-failure");
  assert.equal(failed[0].nextAttemptAt, undefined);
  assert.ok(failed[0].deadLetteredAt);
  assert.equal(publisher.deadLetters.has("event-failure"), true);

  await publisher.requeueDeadLetter("event-failure");
  assert.deepEqual(requeued, ["event-failure"]);
  assert.equal(publisher.deadLetters.has("event-failure"), false);
});

test("OutboxPublisher does not redeliver a destination already acknowledged before another destination retries", async () => {
  const deliveryEvent = event("event-partial-retry");
  const delivered = new Set();
  const hits = { stable: 0, retry: 0 };
  let retryFails = true;
  await withHttpServer((request, response) => {
    const name = request.url?.slice(1) ?? "";
    hits[name] += 1;
    if (name === "retry" && retryFails) response.writeHead(503).end();
    else response.writeHead(204).end();
  }, async (url) => {
    const persistence = {
      claimOutbox: async () => [deliveryEvent],
      markOutboxPublished: async () => undefined,
      markOutboxFailed: async () => undefined,
      isWebhookDelivered: async (eventId, destinationId) => delivered.has(`${eventId}:${destinationId}`),
      markWebhookDelivered: async (eventId, destinationId) => delivered.add(`${eventId}:${destinationId}`),
    };
    const publisher = new OutboxPublisher(persistence, [
      { destinationId: "stable", url: `${url}/stable`, secret: Buffer.alloc(32, 1), eventTypes: [deliveryEvent.eventType] },
      { destinationId: "retry", url: `${url}/retry`, secret: Buffer.alloc(32, 2), eventTypes: [deliveryEvent.eventType] },
    ], { maxAttempts: 5, timeoutMs: 500, baseBackoffMs: 100 });
    assert.deepEqual(await publisher.publishBatch(), { published: 0, failed: 1 });
    retryFails = false;
    assert.deepEqual(await publisher.publishBatch(), { published: 1, failed: 0 });
  });
  assert.deepEqual(hits, { stable: 1, retry: 2 });
});
