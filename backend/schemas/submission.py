"""Pydantic Schemas — Students and Submissions"""

from datetime import datetime
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class StudentBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    section: Optional[str] = None
    roll_number: Optional[str] = None


class StudentResponse(StudentBase):
    id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SubmissionResponse(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: Optional[uuid.UUID] = None
    original_filename: str
    file_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    word_count: Optional[int] = None
    detected_name: Optional[str] = None
    name_confidence: Optional[float] = None
    name_flagged: bool = False
    status: str
    error_message: Optional[str] = None
    retry_count: int = 0
    uploaded_at: datetime
    student: Optional[StudentResponse] = None

    model_config = ConfigDict(from_attributes=True)


class SubmissionUpdateStudent(BaseModel):
    student_name: str = Field(min_length=1)
    section: Optional[str] = None


class BatchNameResolutionItem(BaseModel):
    submission_id: uuid.UUID
    student_name: str


class BatchNameResolutionRequest(BaseModel):
    resolutions: List[BatchNameResolutionItem]
