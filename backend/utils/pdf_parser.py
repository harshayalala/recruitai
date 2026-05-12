# utils/pdf_parser.py
import pdfplumber
import io
import logging

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using pdfplumber only."""
    text = ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = []
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    pages.append(page_text.strip())
            text = "\n\n".join(pages)
    except Exception as e:
        logger.error(f"pdfplumber failed: {e}")
        text = ""

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def get_pdf_metadata(file_bytes: bytes) -> dict:
    """Extract basic PDF metadata."""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            return {
                "page_count": len(pdf.pages),
                "title": "",
                "author": "",
            }
    except Exception:
        return {"page_count": 0, "title": "", "author": ""}
