# Running the PDF parsers locally

This guide covers converting `docs/policy.pdf` to Markdown with different parsers, comparing the results, and loading the one you pick into MongoDB.

Run every command from the **project root** (the folder with `package.json`), not from this folder.

## The parsers

| Name       | What it is                                     | Language | Speed on a laptop CPU | Needs            |
| ---------- | ---------------------------------------------- | -------- | --------------------- | ---------------- |
| `pdf2json` | Raw text extraction, the app's current default | Node     | < 1 s                 | Nothing extra    |
| `pymupdf`  | Rule-based layout → Markdown (`pymupdf4llm`)   | Python   | ~10 s                 | Python venv      |
| `docling`  | ML layout and table models (IBM Docling)       | Python   | ~3 min                | Python venv      |
| `gemini`   | Vision LLM reads the pages                     | Node     | ~1 min                | `GEMINI_API_KEY` |

Each parser writes `parsed/<name>.md`. Every page starts with a `<!-- page N -->` marker, so the outputs are comparable and page numbers are kept.

---

## 1. One-time setup

### Prerequisites

```bash
node --version      # 20 or newer
python3 --version   # 3.10 or newer
npm install
```

On Debian or Ubuntu, if `python3 -m venv` fails, install venv support first: `sudo apt install python3-venv`.

### Create the Python environment

The Python parsers live in their own virtual environment, `.venv-parsers/`, so they don't affect your system Python. Git ignores this folder.

```bash
python3 -m venv .venv-parsers

# Install the CPU build of PyTorch FIRST. Docling depends on PyTorch, and the default
# build includes ~4 GB of NVIDIA CUDA libraries that are useless without an NVIDIA GPU.
.venv-parsers/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

.venv-parsers/bin/pip install -r scripts/parsers/requirements.txt
```

This needs about **2 GB** of disk, plus about **0.5 GB** for Docling's models, which download on its first run. Check that the install worked:

```bash
.venv-parsers/bin/python -c "import pymupdf4llm, docling, torch; print('ok, cuda =', torch.cuda.is_available())"
# ok, cuda = False   ← expected on a laptop without an NVIDIA GPU
```

To skip Docling, install only `pymupdf4llm` (about 300 MB, no PyTorch):

```bash
.venv-parsers/bin/pip install pymupdf4llm
```

### Gemini parser (optional)

Gemini uses the same `GEMINI_API_KEY` as the app, from `.env`. No extra setup.

---

## 2. Run the parsers

### All of them

```bash
npm run parse:compare
```

When it finishes, it prints a summary:

```
┌─────────┬────────────┬─────────┬──────────────────────┐
│ (index) │ parser     │ seconds │ output               │
├─────────┼────────────┼─────────┼──────────────────────┤
│ 0       │ 'pdf2json' │ '0.6'   │ 'parsed/pdf2json.md' │
│ 1       │ 'pymupdf'  │ '8.0'   │ 'parsed/pymupdf.md'  │
│ 2       │ 'docling'  │ '178.1' │ 'parsed/docling.md'  │
│ 3       │ 'gemini'   │ '-'     │ 'FAILED: …'          │
└─────────┴────────────┴─────────┴──────────────────────┘
```

A failed parser doesn't stop the others.

### Only some of them

Put the names after `--`:

```bash
npm run parse:compare -- pymupdf
npm run parse:compare -- pdf2json pymupdf
```

### Directly, without npm

Useful for debugging a single parser:

```bash
.venv-parsers/bin/python scripts/parsers/parse_pymupdf.py docs/policy.pdf parsed/pymupdf.md
.venv-parsers/bin/python scripts/parsers/parse_docling.py docs/policy.pdf parsed/docling.md
node scripts/parsers/parse-gemini.js docs/policy.pdf parsed/gemini.md
```

Or activate the venv once and use plain `python`:

```bash
source .venv-parsers/bin/activate
python scripts/parsers/parse_pymupdf.py docs/policy.pdf parsed/pymupdf.md
deactivate
```

### A different PDF

The npm script parses `PDF_PATH` from `.env` (default `./docs/policy.pdf`). Override it for a single run:

```bash
PDF_PATH=./docs/other.pdf npm run parse:compare -- pymupdf
```

---

## 3. Compare the outputs

```bash
npm run parse:report
```

This writes **`parsed/report.md`**. It shows the same passages from every output side by side (the PED clause, the claim documents list, the grace period clause, the multi-column exclusions area, a table), plus stats: number of headings, list items and table rows. Open it in VS Code and use **Markdown: Open Preview** (`Ctrl+Shift+V`).

The report compares every `.md` file in `parsed/`, so re-run it whenever you re-run a parser.

What to check:

| Check          | What good looks like                                       |
| -------------- | ---------------------------------------------------------- |
| Clauses intact | One sentence stays on one line, under its heading          |
| Lists together | All bullet items under their heading                       |
| Reading order  | Multi-column text isn't interleaved line by line           |
| Tables         | Markdown tables (`\| a \| b \|`), not flattened text       |
| Text accuracy  | No split words ("di rect") or joined words ("preexisting") |
| Speed          | Fine for a one-off load, but matters for many documents    |

---

## 4. Load a parser's output into MongoDB

Set the parsed file in `.env`:

```env
DOC_MARKDOWN_PATH=parsed/pymupdf.md
```

Then restart the app and load it:

```bash
npm run dev
curl -X POST http://localhost:3000/load-document     # returns a jobId
curl http://localhost:3000/jobs/<jobId>              # until "completed"
```

The job result shows the file it loaded: `"source": "pymupdf.md"`. To go back to reading the PDF with `pdf2json`, remove `DOC_MARKDOWN_PATH` from `.env`.

After every re-load, re-run your benchmark questions and `node scripts/recall-test.js`, and re-check `MIN_SCORE`. Different text produces different scores.

---

## Troubleshooting

| Message                                                             | Meaning / fix                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FAILED: Python venv missing`                                       | `.venv-parsers/` doesn't exist. Do the setup in section 1.                                                                                                                                                 |
| `ModuleNotFoundError: No module named 'pymupdf4llm'` (or `docling`) | The package isn't installed in the venv. Run the `pip install` lines again, using `.venv-parsers/bin/pip`, not your system `pip`.                                                                          |
| `Using RapidOCR for OCR processing.`                                | Harmless. `pymupdf4llm` found the OCR engine that came with Docling, and uses it only for areas without a text layer.                                                                                      |
| Docling seems stuck on its first run                                | It's downloading about 500 MB of models to `~/.cache/huggingface/`. Later runs skip this.                                                                                                                  |
| `gemini … failed, retrying` with code `503`                         | Google's servers are busy. The script retries, then falls back to `gemini-flash-lite-latest`. To choose the model yourself: `GEMINI_PARSE_MODEL=gemini-flash-lite-latest npm run parse:compare -- gemini`. |
| `no text, finishReason=RECITATION`                                  | Gemini declined to reproduce text it recognises as existing published material. Standard policy wording triggers this. It's a provider guardrail; use a different parser for this document.                |
| `No space left on device` during `pip install`                      | Make sure you installed the CPU-only PyTorch first. Free the pip download cache with `.venv-parsers/bin/pip cache purge`.                                                                                  |
| `Warning: Setting up fake worker.`                                  | Harmless message from `pdf2json`.                                                                                                                                                                          |

---

## Clean up

Delete these to remove everything the parsers installed:

| Path                    | What it is       | Size    |
| ----------------------- | ---------------- | ------- |
| `.venv-parsers/`        | Python packages  | ~2 GB   |
| `~/.cache/huggingface/` | Docling's models | ~0.5 GB |
| `parsed/`               | Parser outputs   | < 1 MB  |

If you later want to run the Python parsers again, repeat section 1.
