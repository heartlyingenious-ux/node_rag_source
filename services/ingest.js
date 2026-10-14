const fs = require("fs/promises");
const path = require("path");
const PDFParser = require("pdf2json");
const createError = require("http-errors");
const config = require("../config");
const logger = require("../lib/logger");
const { getDb } = require("../lib/db");
const { mapWithConcurrency } = require("../lib/concurrency");
const { embed } = require("../providers/embeddings");
const jobs = require("./jobs");

const PAGE_BREAK = /\r?\n-+Page \(\d+\) Break-+\r?\n/;

// Resolves with the raw text of each PDF page
function readPdfPages(pdfPath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true);
    parser.once("pdfParser_dataError", (error) => reject(error.parserError || error));
    parser.once("pdfParser_dataReady", () => {
      const pages = parser.getRawTextContent().split(PAGE_BREAK);
      // The text ends with a page break, which leaves an empty last "page"
      if (pages.length && !pages.at(-1).trim()) pages.pop();
      resolve(pages);
    });
    parser.loadPDF(pdfPath);
  });
}

const PAGE_MARKER = /<!-- page \d+ -->/;

// Pages of a parser's Markdown output, split on the <!-- page N --> markers
async function readMarkdownPages(markdownPath) {
  const text = await fs.readFile(markdownPath, "utf8");
  return text.split(PAGE_MARKER).slice(1);
}

function readPages() {
  return config.docMarkdownPath
    ? readMarkdownPages(config.docMarkdownPath)
    : readPdfPages(config.pdfPath);
}

// Lesson 3 (chunking): replace this one-line-per-chunk split with your chunker.
// Return strings, or objects like { text, page, section }; extra fields are stored with the chunk.
function splitIntoChunks(pages) {
  // The PDF text mixes CRLF and LF line endings
  return pages
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function ingestDocument(job) {
  const pages = await readPages();
  const chunks = splitIntoChunks(pages.slice(0, config.maxPdfPages));
  job.progress.total = chunks.length;

  // Embed everything first, so a failure midway leaves the old data intact
  const embedded = await mapWithConcurrency(chunks, config.ingestConcurrency, async (chunk) => {
    const doc = typeof chunk === "string" ? { text: chunk } : chunk;
    try {
      const embedding = await embed(doc.text, "RETRIEVAL_DOCUMENT");
      return { ...doc, embedding };
    } catch (error) {
      logger.warn({ err: error.message, text: doc.text.slice(0, 120) }, "Skipping chunk");
      return null;
    } finally {
      job.progress.done += 1;
    }
  });
  const docs = embedded.filter(Boolean);

  // Replace the collection contents so re-loading never creates duplicates
  const collection = getDb().collection("docs");
  await collection.deleteMany({});
  if (docs.length) await collection.insertMany(docs);

  const result = {
    source: path.basename(config.docMarkdownPath || config.pdfPath),
    pages: Math.min(pages.length, config.maxPdfPages),
    chunks: chunks.length,
    inserted: docs.length,
    skipped: chunks.length - docs.length,
  };
  logger.info(result, "Document loaded");
  return result;
}

// Starts loading in the background and returns the job to poll
function startIngestJob() {
  const running = jobs.findRunning("load-document");
  if (running) {
    throw createError(409, `A document load is already running (job ${running.id})`);
  }

  const job = jobs.createJob("load-document");
  jobs.runJob(job, ingestDocument, logger);
  return job;
}

module.exports = {
  startIngestJob,
  readPdfPages,
};
