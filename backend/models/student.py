"""SQLAlchemy ORM Model — Students"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base, GUID

if TYPE_CHECKING:
    from models.submission import Submission


class Student(Base):
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(
        GUID, primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    section: Mapped[str | None] = mapped_column(String(100), nullable=True)
    roll_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


    submissions: Mapped[List["Submission"]] = relationship(back_populates="student")
