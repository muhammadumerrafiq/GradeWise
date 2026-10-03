"""Pydantic schemas package"""

from .assignment import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentStatsResponse,
    AssignmentUpdate,
    GradeScaleEntry,
    RequirementCreate,
    RequirementResponse,
    RubricCriterionCreate,
    RubricCriterionResponse,
)
from .evaluation import (
    CriterionScoreBase,
    CriterionScoreResponse,
    CriterionScoreUpdate,
    EnglishAnalysis,
    EnglishCategory,
    EvaluationResponse,
    EvaluationUpdate,
    RequirementResult,
    ResultsListResponse,
    SubmissionResultRow,
)
from .export import ExportRequest, ExportResponse
from .settings import (
    SettingsResponse,
    SettingsUpdateRequest,
    TestGeminiRequest,
    TestGeminiResponse,
)
from .submission import (
    BatchNameResolutionItem,
    BatchNameResolutionRequest,
    StudentBase,
    StudentResponse,
    SubmissionResponse,
    SubmissionUpdateStudent,
)

__all__ = [
    "GradeScaleEntry",
    "RubricCriterionCreate",
    "RubricCriterionResponse",
    "RequirementCreate",
    "RequirementResponse",
    "AssignmentCreate",
    "AssignmentUpdate",
    "AssignmentResponse",
    "AssignmentStatsResponse",
    "StudentBase",
    "StudentResponse",
    "SubmissionResponse",
    "SubmissionUpdateStudent",
    "BatchNameResolutionItem",
    "BatchNameResolutionRequest",
    "CriterionScoreBase",
    "CriterionScoreUpdate",
    "CriterionScoreResponse",
    "RequirementResult",
    "EnglishCategory",
    "EnglishAnalysis",
    "EvaluationUpdate",
    "EvaluationResponse",
    "SubmissionResultRow",
    "ResultsListResponse",
    "ExportRequest",
    "ExportResponse",
    "SettingsResponse",
    "SettingsUpdateRequest",
    "TestGeminiRequest",
    "TestGeminiResponse",
]

from .manual import (
    ManualSessionCreate,
    ManualSessionUpdate,
    ManualSessionResponse,
    ManualRequirementItem,
    ManualEvaluationCreate,
    ManualEvaluationUpdate,
    ManualEvaluationResponse,
)

__all__.extend([
    "ManualSessionCreate",
    "ManualSessionUpdate",
    "ManualSessionResponse",
    "ManualRequirementItem",
    "ManualEvaluationCreate",
    "ManualEvaluationUpdate",
    "ManualEvaluationResponse",
])

