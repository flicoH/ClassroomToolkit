import hmac
import os
from threading import Lock
from io import BytesIO

from heading_units import detect_heading_units

from docling.datamodel.base_models import DocumentStream, InputFormat
from docling.datamodel.pipeline_options import (
    RapidOcrOptions,
    ThreadedPdfPipelineOptions,
)
from docling.document_converter import DocumentConverter, PdfFormatOption
from fastapi import FastAPI, File, Header, HTTPException, UploadFile

MAX_FILE_BYTES = 30 * 1024 * 1024
MAX_PAGES = 300
MAX_PAGE_CHARS = 50_000
MAX_TOTAL_CHARS = 1_000_000
API_KEY = os.getenv("SEMESTER_REPORT_PARSER_API_KEY", "")

pipeline_options = ThreadedPdfPipelineOptions(
    ocr_batch_size=1,
    layout_batch_size=1,
    table_batch_size=1,
    document_timeout=600,
)
pipeline_options.do_ocr = True
pipeline_options.ocr_options = RapidOcrOptions(lang=["ch"])
pipeline_options.do_table_structure = True
converter = DocumentConverter(
    allowed_formats=[InputFormat.PDF],
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    },
)
parse_lock = Lock()

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health():
    return {"status": "ok", "parser": "docling"}


@app.post("/parse")
def parse_pdf(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    if API_KEY and not hmac.compare_digest(
        authorization or "", f"Bearer {API_KEY}"
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="PDF required")

    content = file.file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds 30 MB")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="Invalid PDF")

    try:
        stream = DocumentStream(
            name=os.path.basename(file.filename), stream=BytesIO(content)
        )
        with parse_lock:
            result = converter.convert(
                stream,
                max_num_pages=MAX_PAGES,
                max_file_size=MAX_FILE_BYTES,
            )
    except Exception as exc:
        raise HTTPException(status_code=422, detail="PDF parsing failed") from exc

    page_numbers = sorted(int(number) for number in result.document.pages.keys())
    if (
        not page_numbers
        or len(page_numbers) > MAX_PAGES
        or page_numbers != list(range(1, len(page_numbers) + 1))
    ):
        raise HTTPException(status_code=422, detail="No valid PDF pages found")

    pages = []
    total_chars = 0
    for page_number in page_numbers:
        text = result.document.export_to_text(
            page_no=page_number, traverse_pictures=True
        ).strip()
        if len(text) > MAX_PAGE_CHARS:
            raise HTTPException(status_code=422, detail="PDF page text exceeds limit")
        total_chars += len(text)
        pages.append({"page": page_number, "text": text})
    if total_chars == 0:
        raise HTTPException(status_code=422, detail="No readable text found in PDF")
    if total_chars > MAX_TOTAL_CHARS:
        raise HTTPException(status_code=422, detail="PDF text exceeds limit")

    return {"pages": pages, "units": detect_heading_units(pages)}
