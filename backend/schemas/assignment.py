"""Pydantic Schemas — Assignments, Rubrics, Requirements"""

from datetime import datetime
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, model_validator


class GradeScaleEntry(BaseModel):
    min_pct: int = Field(ge=0, le=100)
    label: str


class RubricCriterionBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    max_marks: int = Field(gt=0)
    description: Optional[str] = None
    sort_order: int = 0


class RubricCriterionCreate(RubricCriterionBase):
    pass


class RubricCriterionResponse(RubricCriterionBase):
    id: uuid.UUID
    assignment_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RequirementBase(BaseModel):
    description: str = Field(min_length=1)
    sort_order: int = 0


class RequirementCreate(RequirementBase):
    pass


class RequirementResponse(RequirementBase):
    id: uuid.UUID
    assignment_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssignmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    type: str = Field(default="essay")
    instructions: Optional[str] = None
    grading_notes: Optional[str] = None
    feedback_instructions: Optional[str] = None
    total_marks: int = Field(gt=0)
    grade_scale: Optional[List[GradeScaleEntry]] = None
    status: str = Field(default="active")
    rubric_criteria: List[RubricCriterionCreate] = Field(default_factory=list)
    requirements: List[RequirementCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_rubric(self):
        if not self.rubric_criteria:
            raise ValueError("At least one rubric criterion is required.")
        rubric_sum = sum(c.max_marks for c in self.rubric_criteria)
        if rubric_sum != self.total_marks:
            raise ValueError(
                f"Sum of rubric criteria marks ({rubric_sum}) must equal total marks ({self.total_marks})."
            )
        return self


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    instructions: Optional[str] = None
    grading_notes: Optional[str] = None
    feedback_instructions: Optional[str] = None
    total_marks: Optional[int] = None
    grade_scale: Optional[List[GradeScaleEntry]] = None
    status: Optional[str] = None
    rubric_criteria: Optional[List[RubricCriterionCreate]] = None
    requirements: Optional[List[RequirementCreate]] = None

    @model_validator(mode="after")
    def validate_rubric_sum(self):
        if self.rubric_criteria is not None and self.total_marks is not None:
            rubric_sum = sum(c.max_marks for c in self.rubric_criteria)
            if rubric_sum != self.total_marks:
                raise ValueError(
                    f"Sum of rubric criteria marks ({rubric_sum}) must equal total marks ({self.total_marks})."
                )
        return self


class AssignmentResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    type: str
    instructions: Optional[str] = None
    grading_notes: Optional[str] = None
    feedback_instructions: Optional[str] = None
    total_marks: int
    grade_scale: Optional[List[GradeScaleEntry]] = None
    status: str
    created_at: datetime
    updated_at: datetime
    rubric_criteria: List[RubricCriterionResponse] = Field(default_factory=list)
    requirements: List[RequirementResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class AssignmentStatsResponse(BaseModel):
    assignment_id: uuid.UUID
    title: str
    type: str
    total_marks: int
    status: str
    created_at: datetime
    total_submissions: int = 0
    approved_count: int = 0
    pending_review_count: int = 0
    error_count: int = 0
    avg_percentage: Optional[float] = None
    min_score: Optional[int] = None
    max_score: Optional[int] = None
