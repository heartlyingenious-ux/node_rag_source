// POST JSON with a timeout. Errors carry `status` so withRetry can classify them.
async function postJson(url, body, { headers = {}, timeoutMs, errorHint = "" } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });

  if (!response.ok) {
    const error = new Error(
      `POST ${url} failed (${response.status}): ${await response.text()}${errorHint}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

module.exports = {
  postJson,
};
