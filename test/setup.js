// Loaded before each test file (see "test" script). Real values in .env are not
// overridden by dotenv, so these win and the tests never touch Atlas or an API.
Object.assign(process.env, {
  NODE_ENV: "test",
  DB: "mongodb://127.0.0.1:1/test",
  EMBEDDING_PROVIDER: "ollama",
  CHAT_PROVIDER: "ollama",
  RATE_LIMIT_PER_MINUTE: "0",
});
