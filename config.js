require("dotenv").config();

// Creates the vectors for /load-document and search: "gemini" or "ollama"
const embeddingProvider = process.env.EMBEDDING_PROVIDER || "gemini";
// Answers questions in /conversation: "gemini", "ollama" or "ollama-cloud"
const chatProvider = process.env.CHAT_PROVIDER || "gemini";

// Global app config. Values can be overridden from .env.
const config = {
  embeddingProvider,
  chatProvider,

  // Must match numDimensions of the Atlas vector index.
  // Switching embedding provider/model requires re-loading the docs collection.
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS) || 768,

  // Number of PDF pages read by /load-document.
  // Each line is one embedding call. Local Ollama has no rate limits, so it
  // reads every page; Gemini is limited to 2 pages to stay within the free tier.
  maxPdfPages:
    Number(process.env.MAX_PDF_PAGES) ||
    (embeddingProvider === "ollama" ? Infinity : 2),
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

  // Chat only: Ollama Cloud has no embedding models
  ollamaCloud: {
    url: process.env.OLLAMA_CLOUD_URL || "https://ollama.com",
    apiKey: process.env.OLLAMA_API_KEY,
    chatModel: process.env.OLLAMA_CLOUD_CHAT_MODEL || "gpt-oss:120b",
  },
};

module.exports = config;
