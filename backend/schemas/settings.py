"""Pydantic Schemas — Settings"""

from typing import List, Optional
from pydantic import BaseModel
from schemas.assignment import GradeScaleEntry


class SettingsResponse(BaseModel):
    teacher_name: str
    teacher_email: Optional[str] = None
    gemini_api_key_configured: bool
    gemini_api_key_masked: str
    gemini_model: str
    grade_scale: List[GradeScaleEntry]
    storage_used_bytes: int = 0
    auto_delete_days: int = 30
    default_export_format: str = "pdf"


class SettingsUpdateRequest(BaseModel):
    teacher_name: Optional[str] = None
    teacher_email: Optional[str] = None
    gemini_api_key: Optional[str] = None
    grade_scale: Optional[List[GradeScaleEntry]] = None
    auto_delete_days: Optional[int] = None
    default_export_format: Optional[str] = None


class TestGeminiRequest(BaseModel):
    api_key: Optional[str] = None


class TestGeminiResponse(BaseModel):
    success: bool
    message: str
