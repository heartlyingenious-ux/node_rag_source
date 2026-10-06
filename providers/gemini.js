const { GoogleGenAI } = require("@google/genai");
const config = require("../config");

const clients = new Map();

// One client per timeout setting, created on first use
function getGeminiClient(timeoutMs) {
  if (!clients.has(timeoutMs)) {
    clients.set(
      timeoutMs,
      new GoogleGenAI({ apiKey: config.gemini.apiKey, httpOptions: { timeout: timeoutMs } }),
    );
  }
  return clients.get(timeoutMs);
}

module.exports = {
  getGeminiClient,
};
