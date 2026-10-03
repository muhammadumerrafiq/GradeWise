"""Pydantic Schemas — Evaluations and Criterion Scores"""

from datetime import datetime
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field
from schemas.submission import SubmissionResponse


class CriterionScoreBase(BaseModel):
    criterion_id: uuid.UUID
    criterion_name: str
    score: int
    max_score: int
    rationale: Optional[str] = None
    evidence: Optional[str] = None


class CriterionScoreUpdate(BaseModel):
    criterion_id: uuid.UUID
    score: int = Field(ge=0)
    rationale: Optional[str] = None
    evidence: Optional[str] = None


class CriterionScoreResponse(CriterionScoreBase):
    id: uuid.UUID
    evaluation_id: uuid.UUID

    model_config = ConfigDict(from_attributes=True)


class RequirementResult(BaseModel):
    description: str
    status: str  # PASS, FAIL, PARTIAL
    detail: str


class EnglishCategory(BaseModel):
    summary: str
    issues: List[str] = Field(default_factory=list)
    severity: str  # none, minor, moderate, significant


class EnglishAnalysis(BaseModel):
    grammar: EnglishCategory
    vocabulary: EnglishCategory
    tenses: EnglishCategory
    mechanics: EnglishCategory
    structure: EnglishCategory


class EvaluationUpdate(BaseModel):
    criterion_scores: Optional[List[CriterionScoreUpdate]] = None
    teacher_feedback: Optional[str] = None
    teacher_notes: Optional[str] = None
    eval_status: Optional[str] = None


class EvaluationResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    total_score: int
    max_score: int
    percentage: Optional[float] = None
    grade_label: Optional[str] = None
    requirements_result: Optional[List[RequirementResult]] = None
    english_analysis: Optional[EnglishAnalysis] = None
    strengths: Optional[List[str]] = None
    improvements: Optional[List[str]] = None
    ai_feedback: Optional[str] = None
    teacher_feedback: Optional[str] = None
    teacher_notes: Optional[str] = None
    eval_status: str
    gemini_model: Optional[str] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    raw_gemini_response: Optional[str] = None
    generated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    updated_at: datetime
    criterion_scores: List[CriterionScoreResponse] = Field(default_factory=list)
    submission: Optional[SubmissionResponse] = None

    model_config = ConfigDict(from_attributes=True)


class SubmissionResultRow(BaseModel):
    submission_id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: Optional[uuid.UUID] = None
    student_name: str
    original_filename: str
    word_count: Optional[int] = None
    status: str
    evaluation_id: Optional[uuid.UUID] = None
    total_score: Optional[int] = None
    max_score: Optional[int] = None
    percentage: Optional[float] = None
    grade_label: Optional[str] = None
    eval_status: Optional[str] = None
    teacher_feedback: Optional[str] = None
    error_message: Optional[str] = None
    uploaded_at: datetime
    generated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None


class ResultsListResponse(BaseModel):
    items: List[SubmissionResultRow]
    total: int
    distribution_summary: str
