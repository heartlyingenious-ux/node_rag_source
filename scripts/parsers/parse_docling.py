"""PDF -> Markdown with Docling (ML layout model + table structure model)."""
import sys

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

pdf_path, out_path = sys.argv[1], sys.argv[2]

# The policy PDF has a real text layer, so OCR would only add time
options = PdfPipelineOptions(do_ocr=False, do_table_structure=True)
converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)}
)
doc = converter.convert(pdf_path).document

with open(out_path, "w", encoding="utf-8") as out:
    for number in range(1, doc.num_pages() + 1):
        out.write(f"<!-- page {number} -->\n\n{doc.export_to_markdown(page_no=number).strip()}\n\n")
