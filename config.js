require("dotenv").config({ quiet: true });
const { z } = require("zod");

// Empty strings in .env (e.g. `MAX_PDF_PAGES=`) count as "not set"
const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));

const schema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.string().default("info"),

    // Creates the vectors for /load-document and search. Defaults to local Ollama.
    EMBEDDING_PROVIDER: z.enum(["gemini", "ollama"]).default("ollama"),
    // Answers questions in /conversation. Defaults to local Ollama.
    CHAT_PROVIDER: z.enum(["gemini", "ollama", "ollama-cloud"]).default("ollama"),

    // Must match numDimensions of the Atlas vector index.
    // Switching embedding provider/model requires re-loading the docs collection.
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

    MAX_PDF_PAGES: z.coerce.number().int().positive().optional(),
    PDF_PATH: z.string().default("./docs/policy.pdf"),
    // Parallel embedding calls during /load-document
    INGEST_CONCURRENCY: z.coerce.number().int().positive().optional(),

    // Requests per minute per IP on /conversation. 0 disables the limit.
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(30),
    EMBED_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

    DB: z.string({ error: "DB (MongoDB connection string) is required" }),
    DB_NAME: z.string().default("rag_doc"),
    VECTOR_INDEX: z.string().default("vector_index"),

    GEMINI_API_KEY: z.string().trim().optional(),
    GEMINI_CHAT_MODEL: z.string().default("gemini-flash-latest"),
    GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),

    OLLAMA_URL: z.string().url().default("http://localhost:11434"),
    OLLAMA_CHAT_MODEL: z.string().default("llama3.2"),
    OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),

    // Chat only: Ollama Cloud has no embedding models
    OLLAMA_CLOUD_URL: z.string().url().default("https://ollama.com"),
    OLLAMA_API_KEY: z.string().trim().optional(),
    OLLAMA_CLOUD_CHAT_MODEL: z.string().default("gpt-oss:120b"),

    MIN_SCORE: z.coerce.number().min(0).max(1).default(0.81),
  })
  .superRefine((e, ctx) => {
    const usesGemini = e.EMBEDDING_PROVIDER === "gemini" || e.CHAT_PROVIDER === "gemini";
    if (usesGemini && !e.GEMINI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "required when EMBEDDING_PROVIDER or CHAT_PROVIDER is gemini",
      });
    }
    if (e.CHAT_PROVIDER === "ollama-cloud" && !e.OLLAMA_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OLLAMA_API_KEY"],
        message: "required when CHAT_PROVIDER is ollama-cloud",
      });
    }
  });

const parsed = schema.safeParse(env);
if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid configuration in .env:\n${problems}`);
}
const e = parsed.data;
const localEmbeddings = e.EMBEDDING_PROVIDER === "ollama";

// Global app config. Values can be overridden from .env.
const config = {
  env: e.NODE_ENV,
  port: e.PORT,
  logLevel: e.LOG_LEVEL,

  embeddingProvider: e.EMBEDDING_PROVIDER,
  chatProvider: e.CHAT_PROVIDER,
  embeddingDimensions: e.EMBEDDING_DIMENSIONS,

  // Local Ollama has no rate limits, so it reads every page in parallel;
  // Gemini reads 2 pages, one call at a time, to stay within the free tier.
  maxPdfPages: e.MAX_PDF_PAGES ?? (localEmbeddings ? Infinity : 2),
  pdfPath: e.PDF_PATH,
  ingestConcurrency: e.INGEST_CONCURRENCY ?? (localEmbeddings ? 4 : 1),

  rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
  embedTimeoutMs: e.EMBED_TIMEOUT_MS,
  chatTimeoutMs: e.CHAT_TIMEOUT_MS,

  mongo: {
    url: e.DB,
    dbName: e.DB_NAME,
    vectorIndex: e.VECTOR_INDEX,
  },

  gemini: {
    apiKey: e.GEMINI_API_KEY,
    chatModel: e.GEMINI_CHAT_MODEL,
    embedModel: e.GEMINI_EMBED_MODEL,
  },

  ollama: {
    url: e.OLLAMA_URL,
    chatModel: e.OLLAMA_CHAT_MODEL,
    embedModel: e.OLLAMA_EMBED_MODEL,
  },

  ollamaCloud: {
    url: e.OLLAMA_CLOUD_URL,
    apiKey: e.OLLAMA_API_KEY,
    chatModel: e.OLLAMA_CLOUD_CHAT_MODEL,
  },

  minScore: e.MIN_SCORE,
};

module.exports = config;
