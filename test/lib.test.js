const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapWithConcurrency } = require("../lib/concurrency");
const { withRetry } = require("../lib/retry");

test("mapWithConcurrency keeps order and respects the limit", async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  const results = await mapWithConcurrency([30, 10, 20, 5], 2, async (ms, i) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, ms));
    inFlight -= 1;
    return i;
  });

  assert.deepEqual(results, [0, 1, 2, 3]);
  assert.equal(maxInFlight, 2);
});

test("withRetry retries retryable errors", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error("busy"), { status: 503 });
      return "ok";
    },
    { baseDelayMs: 1 },
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetry does not retry client errors", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        throw Object.assign(new Error("bad request"), { status: 400 });
      },
      { baseDelayMs: 1 },
    ),
    /bad request/,
  );
  assert.equal(calls, 1);
});
