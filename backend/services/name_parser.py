"""
GradeWise — Student Name Parser Service
Extracts student names from filenames and computes confidence scores.
"""

import os
import re

NOISE_WORDS = {
    "assignment",
    "task",
    "submission",
    "final",
    "draft",
    "copy",
    "english",
    "writing",
    "essay",
    "homework",
    "narrative",
    "descriptive",
    "paragraph",
    "letter",
    "report",
    "creative",
    "doc",
    "docx",
    "pdf",
    "txt",
    "evaluated",
    "paper",
    "project",
}

GENERIC_NAMES = {"unknown", "student", "anon", "anonymous", "untitled", "file", "document"}


def parse_student_name(filename: str) -> tuple[str, float]:
    """
    Returns (detected_name, confidence_score 0.0-1.0)
    Follows GradeWise name detection algorithm.
    """
    # 1. Remove file extension
    base = os.path.basename(filename)
    name_part, _ = os.path.splitext(base)

    # Replace underscores, hyphens, and dots with spaces so tokens are clean words
    cleaned = re.sub(r"[-_\.]", " ", name_part)

    # Remove roll numbers and semester codes (e.g. FA23, F23, SP24, 014, 991823)
    # Pattern A: alphanumeric roll prefixes like FA23, S22, CS101
    cleaned = re.sub(r"\b[a-zA-Z]{1,4}\d{1,4}\b", " ", cleaned, flags=re.IGNORECASE)
    # Pattern B: standalone numbers (any 2+ digits or IDs)
    cleaned = re.sub(r"\b\d+\b", " ", cleaned)

    # Remove noise words (case-insensitive)
    words = cleaned.split()
    kept_words = []

    for w in words:
        w_clean = re.sub(r"[^\w\']", "", w)
        if not w_clean:
            continue
        w_lower = w_clean.lower()
        if w_lower in NOISE_WORDS:
            continue
        kept_words.append(w_clean)

    # If all tokens were generic/noise or nothing left
    if not kept_words:
        return ("Unknown", 0.1)

    result_name = " ".join(kept_words).strip().title()

    # If the remaining result is too short, numeric, or strictly generic
    if len(result_name) < 3 or result_name.isdigit() or result_name.lower() in GENERIC_NAMES:
        return ("Unknown", 0.1)

    # Score confidence:
    confidence = 0.0
    if len(result_name) > 3:
        confidence += 0.3
    if len(kept_words) >= 2:
        confidence += 0.3
    if not any(char.isdigit() for char in result_name):
        confidence += 0.2
    if all(w.replace("'", "").isalpha() for w in kept_words):
        confidence += 0.2

    confidence = round(min(1.0, max(0.0, confidence)), 2)

    if confidence < 0.5:
        return ("Unknown", confidence)

    return (result_name, confidence)
