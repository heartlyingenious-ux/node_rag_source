// Runs each PDF parser on the policy and writes parsed/<name>.md for comparison.
// Usage: npm run parse:compare                 (all parsers)
//        npm run parse:compare -- docling      (only the named ones)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const config = require("../config");
const { readPdfPages } = require("../services/ingest");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "parsed");
const PYTHON = path.join(ROOT, ".venv-parsers", "bin", "python");
const PDF = path.resolve(ROOT, config.pdfPath);

const PARSERS = {
  // Baseline: what services/ingest.js uses today
  pdf2json: async (out) => {
    const pages = await readPdfPages(PDF);
    fs.writeFileSync(
      out,
      pages.map((text, i) => `<!-- page ${i + 1} -->\n\n${text.trim()}\n`).join("\n"),
    );
  },
  pymupdf: (out) => run(PYTHON, [path.join(__dirname, "parsers", "parse_pymupdf.py"), PDF, out]),
  docling: (out) => run(PYTHON, [path.join(__dirname, "parsers", "parse_docling.py"), PDF, out]),
  gemini: (out) =>
    run(process.execPath, [path.join(__dirname, "parsers", "parse-gemini.js"), PDF, out]),
};

function run(command, args) {
  if (command === PYTHON && !fs.existsSync(PYTHON)) {
    throw new Error("Python venv missing - see README 'Comparing PDF parsers'");
  }
  const result = spawnSync(command, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) throw new Error(`exited with code ${result.status}`);
}

(async () => {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(PARSERS);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const summary = [];
  for (const name of names) {
    if (!PARSERS[name])
      throw new Error(`Unknown parser "${name}". Options: ${Object.keys(PARSERS)}`);
    const out = path.join(OUT_DIR, `${name}.md`);
    console.log(`\n▶ ${name}`);
    const start = performance.now();
    try {
      await PARSERS[name](out);
      const seconds = ((performance.now() - start) / 1000).toFixed(1);
      summary.push({ parser: name, seconds, output: path.relative(ROOT, out) });
    } catch (error) {
      summary.push({ parser: name, seconds: "-", output: `FAILED: ${error.message}` });
    }
  }
  console.log();
  console.table(summary);
})();
