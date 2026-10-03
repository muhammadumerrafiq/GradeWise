"""Pydantic Schemas — Manual Paste Workflow (Module 2)"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class ManualRequirementItem(BaseModel):
    description: str = Field(min_length=1)


class ManualRequirementResult(BaseModel):
    description: str
    status: str = Field(description="PASS, FAIL, or PARTIAL")
    detail: Optional[str] = ""


class ManualSessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    assignment_type: str = Field(default="general")
    instructions: Optional[str] = None
    requirements: List[ManualRequirementItem] = Field(default_factory=list)
    feedback_instructions: str = Field(min_length=1)


class ManualSessionUpdate(BaseModel):
    title: Optional[str] = None
    assignment_type: Optional[str] = None
    instructions: Optional[str] = None
    requirements: Optional[List[ManualRequirementItem]] = None
    feedback_instructions: Optional[str] = None


class ManualEvaluateRequest(BaseModel):
    student_name: str = Field(min_length=1, max_length=255)
    submission_text: str = Field(min_length=1)


ManualEvaluationCreate = ManualEvaluateRequest



class ManualEvaluationResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    student_name: str
    submission_text: str
    word_count: int = 0
    requirements_result: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    writing_quality_summary: Optional[str] = None
    strengths: Optional[List[str]] = Field(default_factory=list)
    improvements: Optional[List[str]] = Field(default_factory=list)
    ai_feedback: Optional[str] = None
    teacher_feedback: Optional[str] = None
    gemini_model: Optional[str] = None
    status: str = "complete"
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManualEvaluationUpdate(BaseModel):
    teacher_feedback: Optional[str] = None


class ManualSessionResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    assignment_type: str
    instructions: Optional[str] = None
    requirements: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    feedback_instructions: str
    evaluations_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManualSessionDetailResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    assignment_type: str
    instructions: Optional[str] = None
    requirements: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    feedback_instructions: str
    created_at: datetime
    updated_at: datetime
    evaluations: List[ManualEvaluationResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
