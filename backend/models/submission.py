"""SQLAlchemy ORM Model — Submissions"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime,
    ForeignKey, Integer, Float, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, GUID
from models.student import Student

if TYPE_CHECKING:
    from models.assignment import Assignment
    from models.evaluation import Evaluation


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','name_pending','extracting','extraction_failed',"
            "'queued','processing','evaluated','review_needed','approved','failed')",
            name="chk_submission_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True
    )
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detected_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    name_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    student: Mapped[Optional["Student"]] = relationship(back_populates="submissions")
    evaluation: Mapped[Optional["Evaluation"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        uselist=False,
    )
