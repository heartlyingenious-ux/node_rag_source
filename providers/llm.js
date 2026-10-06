const config = require("../config");
const { getGeminiClient } = require("./gemini");
const { postJson } = require("../lib/http");
const { withRetry } = require("../lib/retry");

// Local Ollama and Ollama Cloud share the same API; cloud needs an API key
async function generateWithOllama(prompt, { url, chatModel: model, apiKey }) {
  const data = await postJson(
    `${url}/api/generate`,
    { model, prompt, stream: false },
    {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      timeoutMs: config.chatTimeoutMs,
      errorHint: `. Is Ollama running and is "${model}" pulled?`,
    },
  );
  return data.response;
}

async function generateWithGemini(prompt) {
  const response = await getGeminiClient(config.chatTimeoutMs).models.generateContent({
    model: config.gemini.chatModel,
    contents: prompt,
  });
  return response.text;
}

function generate(prompt) {
  switch (config.chatProvider) {
    case "ollama":
      return generateWithOllama(prompt, config.ollama);
    case "ollama-cloud":
      return generateWithOllama(prompt, config.ollamaCloud);
    default:
      return generateWithGemini(prompt);
  }
}

async function generateAnswer(prompt) {
  return withRetry(() => generate(prompt), {
    label: `${config.chatProvider} chat`,
    // Local generation is slow; a retry would double an already long wait
    attempts: config.chatProvider === "ollama" ? 1 : 3,
  });
}

module.exports = {
  generateAnswer,
};
