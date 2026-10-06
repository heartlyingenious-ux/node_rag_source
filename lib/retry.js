const logger = require("./logger");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate limits, server hiccups and timeouts are worth retrying; bad requests are not
function isRetryableError(error) {
  if (!error) return false;

  const status = error.status || error.code || error.error?.code;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;

  const message = String(error.message || "");
  return /UNAVAILABLE|temporar|429|503|timeout|ECONNRESET|fetch failed/i.test(message);
}

async function withRetry(fn, { attempts = 3, baseDelayMs = 1500, label = "request" } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isRetryableError(error)) throw error;

      const delayMs = attempt * baseDelayMs;
      logger.warn({ attempt, attempts, delayMs, err: error.message }, `${label} failed, retrying`);
      await sleep(delayMs);
    }
  }
}

module.exports = {
  withRetry,
  isRetryableError,
};
