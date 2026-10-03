"""
GradeWise — File Extraction Service
Handles text extraction from PDF, DOCX, TXT, and ZIP archives.
"""

import os
import re
import zipfile
import chardet
import fitz  # PyMuPDF
import docx


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}


def count_words(text: str) -> int:
    """Split on whitespace. Count tokens that contain at least one alphanumeric."""
    if not text:
        return 0
    tokens = text.split()
    return sum(1 for token in tokens if re.search(r"[a-zA-Z0-9]", token))


def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract text from PDF using PyMuPDF (fitz).
    Extract text from all pages. Join with newlines.
    Return empty string on failure (do not raise — caller handles empty text).
    """
    try:
        doc = fitz.open(file_path)
        pages_text = []
        for page in doc:
            t = page.get_text()
            if t:
                pages_text.append(t)
        doc.close()
        return "\n".join(pages_text).strip()
    except Exception:
        return ""


def extract_text_from_docx(file_path: str) -> str:
    """
    Extract text from DOCX using python-docx.
    Extract all paragraph texts. Join with newlines.
    """
    try:
        doc = docx.Document(file_path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs).strip()
    except Exception:
        return ""


def extract_text_from_txt(file_path: str) -> str:
    """
    Use chardet to detect encoding. Open with detected encoding. Return text.
    """
    try:
        with open(file_path, "rb") as f:
            raw = f.read()

        detected = chardet.detect(raw)
        encoding = detected.get("encoding") or "utf-8"

        try:
            return raw.decode(encoding).strip()
        except UnicodeDecodeError:
            # Fallback to utf-8 with replacement
            return raw.decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


def extract_text(file_path: str, ext: str) -> str:
    """Dispatches extraction based on file extension."""
    ext = ext.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    elif ext == ".doc":
        # .doc is legacy binary; try docx or text fallback
        t = extract_text_from_docx(file_path)
        if not t:
            t = extract_text_from_txt(file_path)
        return t
    elif ext == ".txt":
        return extract_text_from_txt(file_path)
    return ""


def extract_zip(zip_path: str, output_dir: str) -> list[str]:
    """
    Extract all files in ZIP to output_dir. Return list of extracted file paths.
    Skip files that are not .pdf/.docx/.doc/.txt.
    Skip macOS hidden files (__MACOSX, .DS_Store).
    Prevent path traversal: use os.path.basename on each zip entry name.
    """
    extracted_paths = []
    os.makedirs(output_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue

            base_name = os.path.basename(member.filename)
            if not base_name or base_name.startswith(".") or base_name.startswith("__MACOSX"):
                continue

            _, ext = os.path.splitext(base_name)
            if ext.lower() not in ALLOWED_EXTENSIONS:
                continue

            target_path = os.path.join(output_dir, base_name)

            # Avoid filename collisions in zip
            counter = 1
            root_name, file_ext = os.path.splitext(base_name)
            while os.path.exists(target_path):
                target_path = os.path.join(output_dir, f"{root_name}_{counter}{file_ext}")
                counter += 1

            with zf.open(member) as source, open(target_path, "wb") as target:
                target.write(source.read())

            extracted_paths.append(target_path)

    return extracted_paths


# Aliases for explicit specification naming
extract_from_pdf = extract_text_from_pdf
extract_from_docx = extract_text_from_docx
extract_from_txt = extract_text_from_txt
extract_from_zip = extract_zip

