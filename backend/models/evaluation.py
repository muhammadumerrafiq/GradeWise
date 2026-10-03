"""SQLAlchemy ORM Models — Evaluations and Criterion Scores"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey,
    Integer, Float, String, Text, UniqueConstraint, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, GUID

if TYPE_CHECKING:
    from models.submission import Submission
    from models.assignment import RubricCriterion


class Evaluation(Base):
    __tablename__ = "evaluations"
    __table_args__ = (
        CheckConstraint("total_score >= 0", name="chk_total_score_nonneg"),
        CheckConstraint("max_score > 0", name="chk_max_score_pos"),
        CheckConstraint(
            "percentage >= 0 AND percentage <= 100",
            name="chk_percentage_range",
        ),
        CheckConstraint(
            "eval_status IN ('pending_review','reviewed','approved')",
            name="chk_eval_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        GUID,
        ForeignKey("submissions.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    total_score: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    max_score: Mapped[int] = mapped_column(Integer, nullable=False)
    percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    grade_label: Mapped[str | None] = mapped_column(String(10), nullable=True)

    requirements_result: Mapped[list | None] = mapped_column(JSON, nullable=True)
    english_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    strengths: Mapped[list | None] = mapped_column(JSON, nullable=True)
    improvements: Mapped[list | None] = mapped_column(JSON, nullable=True)

    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    eval_status: Mapped[str] = mapped_column(String(20), default="pending_review", index=True)

    gemini_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_gemini_response: Mapped[str | None] = mapped_column(Text, nullable=True)

    generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    submission: Mapped["Submission"] = relationship(back_populates="evaluation")
    criterion_scores: Mapped[List["CriterionScore"]] = relationship(
        back_populates="evaluation",
        cascade="all, delete-orphan",
    )


class CriterionScore(Base):
    __tablename__ = "criterion_scores"
    __table_args__ = (
        UniqueConstraint("evaluation_id", "criterion_id", name="uq_eval_criterion"),
        CheckConstraint("score >= 0", name="chk_score_nonneg"),
        CheckConstraint("max_score > 0", name="chk_criterion_max_pos"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    evaluation_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("evaluations.id", ondelete="CASCADE"), index=True
    )
    criterion_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("rubric_criteria.id", ondelete="CASCADE")
    )
    criterion_name: Mapped[str] = mapped_column(String(255), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    max_score: Mapped[int] = mapped_column(Integer, nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


    evaluation: Mapped["Evaluation"] = relationship(back_populates="criterion_scores")
    criterion: Mapped["RubricCriterion"] = relationship(
        back_populates="criterion_scores"
    )
