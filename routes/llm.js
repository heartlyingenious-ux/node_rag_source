const { GoogleGenAI } = require("@google/genai");
const config = require("../config");

// Local Ollama and Ollama Cloud share the same API; cloud needs an API key
async function generateWithOllama(prompt, { url: baseUrl, chatModel: model, apiKey }) {
  console.log({ baseUrl, model, prompt });

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama generation failed (${response.status}): ${await response.text()}. Is Ollama running and is "${model}" pulled?`
    );
  }

  const data = await response.json();
  return data.response;
}

async function generateWithGemini(prompt) {
  const ai = new GoogleGenAI({
    apiKey: config.gemini.apiKey,
  });

  const chat = await ai.models.generateContent({
    model: config.gemini.chatModel,
    contents: prompt,
  });

  return chat.text;
}

async function generateAnswer(prompt) {
  if (config.chatProvider === "ollama") {
    return generateWithOllama(prompt, config.ollama);
  }
  if (config.chatProvider === "ollama-cloud") {
    if (!config.ollamaCloud.apiKey) {
      throw new Error("OLLAMA_API_KEY is missing. Add it to your .env file to use ollama-cloud.");
    }
    return generateWithOllama(prompt, config.ollamaCloud);
  }
  return generateWithGemini(prompt);
}

module.exports = {
  generateAnswer,
};
