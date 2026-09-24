const { GoogleGenAI } = require("@google/genai");
const config = require("../config");

function getGeminiClient() {
  const apiKey = config.gemini.apiKey;

  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      "GEMINI_API_KEY is missing. Add it to your .env file before calling the embedding API."
    );
  }

  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableEmbeddingError(error) {
  if (!error) return false;

  const message = String(error.message || JSON.stringify(error || {}));
  const code = error.code || error.status || error.error?.code;

  return (
    code === 429 ||
    code === 500 ||
    code === 503 ||
    /UNAVAILABLE|temporar|429|503|timeout/i.test(message)
  );
}

// nomic-embed-text expects a task prefix on every input
const OLLAMA_TASK_PREFIX = {
  RETRIEVAL_DOCUMENT: "search_document: ",
  RETRIEVAL_QUERY: "search_query: ",
};

async function createOllamaEmbedings(text, taskType) {
  const { url: baseUrl, embedModel: model } = config.ollama;
  const prefix = OLLAMA_TASK_PREFIX[taskType] || "";

  const response = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: prefix + text,
      dimensions: config.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama embedding failed (${response.status}): ${await response.text()}. Is Ollama running and is "${model}" pulled?`
    );
  }

  const data = await response.json();
  // Match the Gemini response shape so callers don't need to change
  return { embeddings: data.embeddings.map((values) => ({ values })) };
}

async function createEmbedings(text, taskType = "RETRIEVAL_DOCUMENT") {
  if (config.llmProvider === "ollama") {
    return createOllamaEmbedings(text, taskType);
  }

  const ai = getGeminiClient();
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await ai.models.embedContent({
        model: config.gemini.embedModel,
        contents: text,
        config: {
          taskType: taskType,
          outputDimensionality: config.embeddingDimensions,
        },
      });

      return response;
    } catch (error) {
      lastError = error;

      if (!isRetryableEmbeddingError(error) || attempt === 3) {
        const message =
          error && error.message
            ? error.message
            : "Unknown Gemini embedding error";

        console.error("Gemini embedding error:", message);
        throw new Error(
          `Gemini embedding failed: ${message}. Check GEMINI_API_KEY and network access to generativelanguage.googleapis.com.`
        );
      }

      const delayMs = attempt * 1500;
      console.warn(
        `Gemini embedding temporarily unavailable; retrying in ${delayMs}ms (attempt ${attempt}/3)`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

module.exports = {
  createEmbedings,
};