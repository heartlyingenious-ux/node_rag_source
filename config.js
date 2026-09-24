require("dotenv").config();

// "gemini" or "ollama"
const llmProvider = process.env.LLM_PROVIDER || "gemini";

// Global app config. Values can be overridden from .env.
const config = {
  llmProvider,

  // Must match numDimensions of the Atlas vector index.
  // Switching provider/model requires re-loading the docs collection.
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 768,

  // Number of PDF pages read by /load-document.
  // Ollama runs locally with no rate limits, so it reads every page;
  // Gemini is limited to 2 pages to stay within the free tier.
  maxPdfPages:
    Number(process.env.MAX_PDF_PAGES) ||
    (llmProvider === "ollama" ? Infinity : 2),
  pdfPath: process.env.PDF_PATH || "./docs/policy.pdf",

  mongo: {
    url: process.env.DB,
    dbName: process.env.DB_NAME || "rag_doc",
    vectorIndex: process.env.VECTOR_INDEX || "vector_index",
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    chatModel: process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest",
    embedModel: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
  },

  ollama: {
    url: process.env.OLLAMA_URL || "http://localhost:11434",
    chatModel: process.env.OLLAMA_CHAT_MODEL || "llama3.2",
    embedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  },
};

module.exports = config;
