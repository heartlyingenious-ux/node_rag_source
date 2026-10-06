const config = require("../config");
const { getGeminiClient } = require("./gemini");
const { postJson } = require("../lib/http");
const { withRetry } = require("../lib/retry");

// nomic-embed-text expects a task prefix on every input
const OLLAMA_TASK_PREFIX = {
  RETRIEVAL_DOCUMENT: "search_document: ",
  RETRIEVAL_QUERY: "search_query: ",
};

async function embedWithOllama(text, taskType) {
  const { url, embedModel: model } = config.ollama;
  const data = await postJson(
    `${url}/api/embed`,
    {
      model,
      input: (OLLAMA_TASK_PREFIX[taskType] || "") + text,
      dimensions: config.embeddingDimensions,
    },
    {
      timeoutMs: config.embedTimeoutMs,
      errorHint: `. Is Ollama running and is "${model}" pulled?`,
    },
  );
  return data.embeddings[0];
}

async function embedWithGemini(text, taskType) {
  const response = await getGeminiClient(config.embedTimeoutMs).models.embedContent({
    model: config.gemini.embedModel,
    contents: text,
    config: {
      taskType,
      outputDimensionality: config.embeddingDimensions,
    },
  });
  return response.embeddings[0].values;
}

/**
 * Turn text into a vector (array of numbers).
 * taskType: "RETRIEVAL_DOCUMENT" for stored chunks, "RETRIEVAL_QUERY" for questions.
 */
async function embed(text, taskType = "RETRIEVAL_DOCUMENT") {
  const run = config.embeddingProvider === "ollama" ? embedWithOllama : embedWithGemini;
  return withRetry(() => run(text, taskType), {
    label: `${config.embeddingProvider} embedding`,
  });
}

function embeddingModelName() {
  return config.embeddingProvider === "ollama"
    ? config.ollama.embedModel
    : config.gemini.embedModel;
}

module.exports = {
  embed,
  embeddingModelName,
};
