const pino = require("pino");
const config = require("../config");

function prettyTransport() {
  if (config.env !== "development") return undefined;
  try {
    // dev dependency: absent in production installs
    require.resolve("pino-pretty");
    return { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } };
  } catch {
    return undefined;
  }
}

const logger = pino({
  level: config.env === "test" ? "silent" : config.logLevel,
  transport: prettyTransport(),
});

module.exports = logger;
