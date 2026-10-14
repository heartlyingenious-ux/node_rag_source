"""PDF -> Markdown with pymupdf4llm (rule-based, fast, no ML models)."""
import sys

import pymupdf4llm

pdf_path, out_path = sys.argv[1], sys.argv[2]

pages = pymupdf4llm.to_markdown(pdf_path, page_chunks=True)
with open(out_path, "w", encoding="utf-8") as out:
    for number, page in enumerate(pages, start=1):
        out.write(f"<!-- page {number} -->\n\n{page['text'].strip()}\n\n")
