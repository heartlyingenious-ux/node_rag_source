const { GoogleGenAI } = require("@google/genai");

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

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

async function createEmbedings(text, taskType = "RETRIEVAL_DOCUMENT") {
  const ai = getGeminiClient();
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: text,
        config: {
          taskType: taskType,
          outputDimensionality: 1536,
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