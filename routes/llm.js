const { GoogleGenAI } = require("@google/genai");
const config = require("../config");

async function generateWithOllama(prompt) {
  const { url: baseUrl, chatModel: model } = config.ollama;
  console.log({ baseUrl, model, prompt });

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  if (config.llmProvider === "ollama") {
    return generateWithOllama(prompt);
  }
  return generateWithGemini(prompt);
}

module.exports = {
  generateAnswer,
};
