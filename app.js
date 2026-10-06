const express = require("express");
const createError = require("http-errors");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const { rateLimit } = require("express-rate-limit");
const config = require("./config");
const logger = require("./lib/logger");
const indexRouter = require("./routes/index");

const app = express();

app.use(helmet());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "100kb" }));

// Every /conversation call costs an embedding + an LLM call
if (config.rateLimitPerMinute > 0) {
  app.use(
    "/conversation",
    rateLimit({
      windowMs: 60_000,
      limit: config.rateLimitPerMinute,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { message: "Too many requests, slow down" },
    }),
  );
}

app.use("/", indexRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError(404, `Route ${req.method} ${req.path} not found`));
});

// JSON error handler. Express 5 forwards errors thrown in async handlers here.
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) req.log.error({ err }, "Request failed");

  // Hide internal error details in production; 4xx messages are meant for the client
  const exposeMessage = status < 500 || config.env === "development";
  res.status(status).json({
    message: exposeMessage ? err.message : "Internal server error",
  });
});

module.exports = app;
