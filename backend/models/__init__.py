"""Import all models to ensure they are registered with SQLAlchemy Base."""

from .assignment import Assignment, Requirement, RubricCriterion, Teacher
from .evaluation import CriterionScore, Evaluation
from .export import Export
from .manual import ManualEvaluation, ManualSession
from .processing import ProcessingJob
from .settings import AppSetting
from .student import Student
from .submission import Submission

__all__ = [
    "Teacher",
    "Assignment",
    "RubricCriterion",
    "Requirement",
    "Student",
    "Submission",
    "Evaluation",
    "CriterionScore",
    "Export",
    "ProcessingJob",
    "AppSetting",
    "ManualSession",
    "ManualEvaluation",
]
