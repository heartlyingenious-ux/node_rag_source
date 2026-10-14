// PDF -> Markdown with a vision LLM (Gemini reads the PDF pages directly).
// Usage: node scripts/parsers/parse-gemini.js <pdf> <out.md>
const fs = require("fs");
const config = require("../../config");
const { getGeminiClient } = require("../../providers/gemini");
const { readPdfPages } = require("../../services/ingest");
const { withRetry } = require("../../lib/retry");

const PAGES_PER_CALL = 4;
// Flash first; Flash-Lite if Flash stays overloaded (503) after retries
const MODELS = [
  process.env.GEMINI_PARSE_MODEL || config.gemini.chatModel,
  "gemini-flash-lite-latest",
];

const instructions = (from, to) => `
Convert pages ${from} to ${to} of the attached PDF into Markdown.

Rules:
- Transcribe the text VERBATIM. Do not summarise, paraphrase, correct or omit anything.
- Put the line <!-- page N --> (N = the page number) before each page's content.
- Where the page has multiple columns, output each column completely, in reading order.
- Use # / ## / ### for headings and section titles, "-" or "1." for list items,
  and Markdown tables for tables.
- Skip repeated page headers/footers (logo text, UIN line, page numbers).
- Output only the Markdown, without code fences or commentary.`;

async function convertRange(ai, pdfBase64, from, to) {
  let lastError;
  for (const model of MODELS) {
    try {
      const response = await withRetry(
        () =>
          ai.models.generateContent({
            model,
            contents: [
              { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
              { text: instructions(from, to) },
            ],
          }),
        { label: `gemini parse pages ${from}-${to} (${model})` },
      );
      const finishReason = response.candidates?.[0]?.finishReason;
      if (!response.text) {
        // RECITATION = Gemini declined to reproduce text it recognises as existing published
        // material. Another model won't help, so fail with the reason instead of retrying.
        throw Object.assign(
          new Error(`pages ${from}-${to}: no text, finishReason=${finishReason}`),
          {
            final: true,
          },
        );
      }
      console.error(`  pages ${from}-${to}: ${model} (${finishReason})`);
      return response.text.replace(/^```(?:markdown)?\s*|\s*```$/g, "").trim();
    } catch (error) {
      if (error.final) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

(async () => {
  const [pdfPath, outPath] = process.argv.slice(2);
  const pageCount = (await readPdfPages(pdfPath)).length;
  const pdfBase64 = fs.readFileSync(pdfPath).toString("base64");
  const ai = getGeminiClient(300_000);

  const parts = [];
  for (let from = 1; from <= pageCount; from += PAGES_PER_CALL) {
    const to = Math.min(from + PAGES_PER_CALL - 1, pageCount);
    parts.push(await convertRange(ai, pdfBase64, from, to));
  }
  fs.writeFileSync(outPath, parts.join("\n\n") + "\n");
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
