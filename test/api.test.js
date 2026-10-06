const { test, afterEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");
const request = require("supertest");

const app = require("../app");
const db = require("../lib/db");
const chat = require("../services/chat");
const ingest = require("../services/ingest");

afterEach(() => mock.restoreAll());
after(() => db.closeDb());

test("POST /conversation rejects a missing message", async () => {
  const res = await request(app).post("/conversation").send({});

  assert.equal(res.status, 400);
  assert.match(res.body.message, /message/);
});

test("POST /conversation rejects a malformed sessionId", async () => {
  const res = await request(app)
    .post("/conversation")
    .send({ message: "hi", sessionId: "not-an-id" });

  assert.equal(res.status, 400);
  assert.match(res.body.message, /sessionId/);
});

test("POST /conversation returns the answer, session and sources", async () => {
  const reply = { sessionId: "abc", answer: "Yes", sources: [{ text: "t", score: 0.9 }] };
  const ask = mock.method(chat, "ask", async () => reply);

  const res = await request(app).post("/conversation").send({ message: "  Is X covered? " });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, reply);
  assert.deepEqual(ask.mock.calls[0].arguments[0], { message: "Is X covered?" });
});

test("unexpected errors return 500 without leaking details", async () => {
  mock.method(chat, "ask", async () => {
    throw new Error("secret connection string");
  });

  const res = await request(app).post("/conversation").send({ message: "hi" });

  assert.equal(res.status, 500);
  assert.equal(res.body.message, "Internal server error");
});

test("POST /load-document starts a background job", async () => {
  mock.method(ingest, "startIngestJob", () => ({ id: "job-1", status: "running" }));

  const res = await request(app).post("/load-document");

  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { jobId: "job-1", status: "running", statusUrl: "/jobs/job-1" });
});

test("GET /jobs/:id returns 404 for unknown jobs", async () => {
  const res = await request(app).get("/jobs/nope");
  assert.equal(res.status, 404);
});

test("GET /health reports 503 when the database is down", async () => {
  mock.method(db, "ping", async () => {
    throw new Error("down");
  });
  mock.method(globalThis, "fetch", async () => new Response("{}", { status: 200 }));

  const res = await request(app).get("/health");

  assert.equal(res.status, 503);
  assert.equal(res.body.db, "down");
  assert.equal(res.body.ollama, "up");
});

test("unknown routes return JSON 404", async () => {
  const res = await request(app).get("/nope");

  assert.equal(res.status, 404);
  assert.match(res.body.message, /not found/);
});
