"""
GradeWise — Database Configuration
SQLAlchemy async engine + session factory.
Supports both SQLite (local dev zero-config) and PostgreSQL (production).
"""

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
import uuid
from sqlalchemy.types import TypeDecorator, String
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

from config import settings


class Base(DeclarativeBase):
    pass


class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type storing as String(36).
    Accepts both str and uuid.UUID objects transparently in SQLite.
    """
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        try:
            return uuid.UUID(str(value))
        except (ValueError, TypeError):
            return value



# SQLite async engine configuration
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create all tables and seed default teacher and settings if not present."""
    async with engine.begin() as conn:
        import models  # Ensure all models are registered
        await conn.run_sync(Base.metadata.create_all)
        # Safe column addition for existing databases
        try:
            from sqlalchemy import text
            await conn.execute(text("ALTER TABLE assignments ADD COLUMN feedback_instructions TEXT;"))
        except Exception:
            pass  # Already exists or database doesn't require alteration

    # Seed initial data
    from models.assignment import Teacher
    from models.settings import AppSetting
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        # Seed teacher
        res = await session.execute(select(Teacher))
        teacher = res.scalars().first()
        if not teacher:
            default_teacher = Teacher(
                name="Teacher",
                email="teacher@gradewise.local",
                grade_scale=[
                    {"min_pct": 90, "label": "A"},
                    {"min_pct": 80, "label": "B"},
                    {"min_pct": 70, "label": "C"},
                    {"min_pct": 60, "label": "D"},
                    {"min_pct": 0, "label": "F"},
                ]
            )
            session.add(default_teacher)

        # Seed app settings
        defaults = {
            "app_version": "1.0.0",
            "max_concurrent_evals": "3",
            "auto_delete_days": "30",
            "default_export_format": "pdf",
        }
        for k, v in defaults.items():
            setting_res = await session.execute(select(AppSetting).where(AppSetting.key == k))
            if not setting_res.scalars().first():
                session.add(AppSetting(key=k, value=v))

        await session.commit()
