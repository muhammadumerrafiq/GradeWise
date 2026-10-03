"""SQLAlchemy ORM Models — Manual Paste Workflow (Module 2)"""

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey,
    Integer, String, Text, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, GUID


class ManualSession(Base):
    __tablename__ = "manual_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("teachers.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    assignment_type: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    requirements: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    feedback_instructions: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    evaluations: Mapped[List["ManualEvaluation"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="desc(ManualEvaluation.created_at)",
    )


class ManualEvaluation(Base):
    __tablename__ = "manual_evaluations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('processing','complete','failed')",
            name="chk_manual_evaluation_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("manual_sessions.id", ondelete="CASCADE"), index=True
    )
    student_name: Mapped[str] = mapped_column(String(255), nullable=False)
    submission_text: Mapped[str] = mapped_column(Text, nullable=False)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    requirements_result: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    writing_quality_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    strengths: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    improvements: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    teacher_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    gemini_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="complete", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    session: Mapped["ManualSession"] = relationship(back_populates="evaluations")

