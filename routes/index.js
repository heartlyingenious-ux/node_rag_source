const express = require("express");
const createError = require("http-errors");
const { z } = require("zod");
const config = require("../config");
const db = require("../lib/db");
const embeddings = require("../providers/embeddings");
const chat = require("../services/chat");
const ingest = require("../services/ingest");
const jobs = require("../services/jobs");

const router = express.Router();

// Throws a 400 listing every invalid field
function validate(schema, data) {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
    throw createError(400, `Invalid request - ${details.join("; ")}`);
  }
  return parsed.data;
}

async function checkOllama() {
  if (config.embeddingProvider !== "ollama" && config.chatProvider !== "ollama") return undefined;
  try {
    const response = await fetch(`${config.ollama.url}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? "up" : `error ${response.status}`;
  } catch {
    return "down";
  }
}

async function health(req, res) {
  const [dbStatus, ollama] = await Promise.all([
    db.ping().then(
      () => "up",
      () => "down",
    ),
    checkOllama(),
  ]);
  const ok = dbStatus === "up" && (ollama === undefined || ollama === "up");

  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    db: dbStatus,
    ollama,
    providers: { embedding: config.embeddingProvider, chat: config.chatProvider },
  });
}

router.get("/", health);
router.get("/health", health);

router.post("/load-document", (req, res) => {
  const job = ingest.startIngestJob();
  res.status(202).json({ jobId: job.id, status: job.status, statusUrl: `/jobs/${job.id}` });
});

router.get("/jobs/:id", (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) throw createError(404, "Job not found");
  res.json(job);
});

const embeddingsQuery = z.object({ text: z.string().trim().min(1).default("Hello World") });

router.get("/embeddings", async (req, res) => {
  const { text } = validate(embeddingsQuery, req.query);
  const embedding = await embeddings.embed(text);
  res.json({
    provider: config.embeddingProvider,
    model: embeddings.embeddingModelName(),
    dimensions: embedding.length,
    embedding,
  });
});

const conversationBody = z.object({
  message: z.string({ error: "is required" }).trim().min(1, "is required").max(2000),
  sessionId: z.string().optional(),
});

router.post("/conversation", async (req, res) => {
  const input = validate(conversationBody, req.body);
  res.json(await chat.ask(input));
});

module.exports = router;
