"""Services package initialization"""

from .evaluation_validator import (
    calculate_grade,
    calculate_percentage,
    count_words,
    validate_evaluation_json,
    validate_response_schema,
    validate_scores,
)
from .export_service import (
    ExportService,
    export_service,
    generate_bulk_zip,
    generate_csv_summary,
    generate_docx,
    generate_excel_summary,
    generate_pdf,
)
from .file_extractor import (
    count_words as count_file_words,
    extract_from_docx,
    extract_from_pdf,
    extract_from_txt,
    extract_from_zip,
    extract_text,
    extract_text_from_docx,
    extract_text_from_pdf,
    extract_text_from_txt,
    extract_zip,
)
from .gemini_service import (
    GeminiService,
    build_evaluation_prompt,
    build_manual_user_prompt,
    build_user_prompt,
    configure_gemini,
    gemini_service,
)
from .name_parser import parse_student_name
from .progress_tracker import ProgressTracker, tracker

__all__ = [
    "validate_scores",
    "validate_response_schema",
    "calculate_percentage",
    "calculate_grade",
    "validate_evaluation_json",
    "count_words",
    "ExportService",
    "export_service",
    "generate_pdf",
    "generate_docx",
    "generate_excel_summary",
    "generate_csv_summary",
    "generate_bulk_zip",
    "extract_from_pdf",
    "extract_from_docx",
    "extract_from_txt",
    "extract_from_zip",
    "extract_text",
    "extract_text_from_pdf",
    "extract_text_from_docx",
    "extract_text_from_txt",
    "extract_zip",
    "count_file_words",
    "GeminiService",
    "gemini_service",
    "configure_gemini",
    "build_user_prompt",
    "build_evaluation_prompt",
    "build_manual_user_prompt",
    "parse_student_name",
    "ProgressTracker",
    "tracker",
]
