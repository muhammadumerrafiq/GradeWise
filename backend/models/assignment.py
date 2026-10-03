"""SQLAlchemy ORM Models — Assignments, Rubric, Requirements"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey,
    Integer, String, Text, JSON, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, GUID

if TYPE_CHECKING:
    from models.submission import Submission
    from models.evaluation import CriterionScore


class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    api_key_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    grade_scale: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    assignments: Mapped[List["Assignment"]] = relationship(
        back_populates="teacher", cascade="all, delete-orphan"
    )


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint("total_marks > 0", name="chk_total_marks_positive"),
        CheckConstraint(
            "type IN ('essay','narrative','descriptive','paragraph',"
            "'letter','report','creative','general','custom')",
            name="chk_assignment_type",
        ),
        CheckConstraint(
            "status IN ('draft','active','archived')",
            name="chk_assignment_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("teachers.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    grading_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_marks: Mapped[int] = mapped_column(Integer, nullable=False)
    grade_scale: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    teacher: Mapped["Teacher"] = relationship(back_populates="assignments")
    rubric_criteria: Mapped[List["RubricCriterion"]] = relationship(
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="RubricCriterion.sort_order",
    )
    requirements: Mapped[List["Requirement"]] = relationship(
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="Requirement.sort_order",
    )
    submissions: Mapped[List["Submission"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan"
    )


class RubricCriterion(Base):
    __tablename__ = "rubric_criteria"

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    max_marks: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    assignment: Mapped["Assignment"] = relationship(back_populates="rubric_criteria")
    criterion_scores: Mapped[List["CriterionScore"]] = relationship(
        back_populates="criterion", cascade="all, delete-orphan"
    )


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("assignments.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    assignment: Mapped["Assignment"] = relationship(back_populates="requirements")

