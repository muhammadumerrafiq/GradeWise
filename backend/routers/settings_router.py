"""
GradeWise — Settings Router
Teacher profile, masked Gemini API key status, test connection, and defaults.
The API key is NEVER returned in plaintext.
"""

import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.assignment import Teacher
from models.settings import AppSetting
from schemas.settings import (
    SettingsResponse,
    SettingsUpdateRequest,
    TestGeminiRequest,
    TestGeminiResponse,
)
from services.gemini_service import gemini_service

router = APIRouter()


def mask_key(key: str) -> str:
    if not key or key == "your_gemini_api_key_here":
        return "Not configured"
    if len(key) <= 8:
        return "••••••••"
    return f"••••••••{key[-4:]}"


def calculate_storage_used() -> int:
    total = 0
    for d in [settings.UPLOAD_DIR, settings.EXPORT_DIR]:
        if os.path.exists(d):
            for root, _, files in os.walk(d):
                for f in files:
                    fp = os.path.join(root, f)
                    if os.path.exists(fp):
                        total += os.path.getsize(fp)
    return total


@router.get("", response_model=SettingsResponse)
async def get_settings_data(db: AsyncSession = Depends(get_db)):
    # Teacher
    res = await db.execute(select(Teacher))
    teacher = res.scalars().first()
    t_name = teacher.name if teacher else "Teacher"
    t_email = teacher.email if teacher else "teacher@gradewise.local"
    grade_scale = teacher.grade_scale if teacher and teacher.grade_scale else [
        {"min_pct": 90, "label": "A"},
        {"min_pct": 80, "label": "B"},
        {"min_pct": 70, "label": "C"},
        {"min_pct": 60, "label": "D"},
        {"min_pct": 0, "label": "F"},
    ]

    # App settings
    settings_res = await db.execute(select(AppSetting))
    all_settings = {s.key: s.value for s in settings_res.scalars().all()}

    auto_delete = int(all_settings.get("auto_delete_days", "30"))
    default_format = all_settings.get("default_export_format", "pdf")

    is_configured = gemini_service.is_configured()
    masked = mask_key(settings.GEMINI_API_KEY)

    return SettingsResponse(
        teacher_name=t_name,
        teacher_email=t_email,
        gemini_api_key_configured=is_configured,
        gemini_api_key_masked=masked,
        gemini_model=settings.GEMINI_MODEL,
        grade_scale=grade_scale,
        storage_used_bytes=calculate_storage_used(),
        auto_delete_days=auto_delete,
        default_export_format=default_format,
    )


@router.put("", response_model=SettingsResponse)
async def update_settings_data(
    payload: SettingsUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    # Update teacher
    res = await db.execute(select(Teacher))
    teacher = res.scalars().first()
    if not teacher:
        teacher = Teacher(name="Teacher", email="teacher@gradewise.local")
        db.add(teacher)

    if payload.teacher_name is not None:
        teacher.name = payload.teacher_name
    if payload.teacher_email is not None:
        teacher.email = payload.teacher_email
    if payload.grade_scale is not None:
        teacher.grade_scale = [g.model_dump() for g in payload.grade_scale]

    # Update AppSetting
    if payload.auto_delete_days is not None:
        st = await db.execute(select(AppSetting).where(AppSetting.key == "auto_delete_days"))
        row = st.scalars().first()
        if not row:
            row = AppSetting(key="auto_delete_days", value=str(payload.auto_delete_days))
            db.add(row)
        else:
            row.value = str(payload.auto_delete_days)

    if payload.default_export_format is not None:
        st = await db.execute(select(AppSetting).where(AppSetting.key == "default_export_format"))
        row = st.scalars().first()
        if not row:
            row = AppSetting(key="default_export_format", value=payload.default_export_format)
            db.add(row)
        else:
            row.value = payload.default_export_format

    # Update Gemini key if provided
    if payload.gemini_api_key and payload.gemini_api_key.strip():
        new_key = payload.gemini_api_key.strip()
        settings.GEMINI_API_KEY = new_key
        # Update .env file safely
        env_file_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_file_path):
            with open(env_file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            new_lines = []
            found = False
            for line in lines:
                if line.startswith("GEMINI_API_KEY="):
                    new_lines.append(f"GEMINI_API_KEY={new_key}\n")
                    found = True
                else:
                    new_lines.append(line)
            if not found:
                new_lines.append(f"GEMINI_API_KEY={new_key}\n")
            with open(env_file_path, "w", encoding="utf-8") as f:
                f.writelines(new_lines)

    await db.commit()
    return await get_settings_data(db)


@router.post("/test-gemini", response_model=TestGeminiResponse)
async def test_gemini_connection(payload: TestGeminiRequest):
    """Pings Gemini API to verify connectivity. Never returns API key."""
    success, msg = await gemini_service.test_connection(api_key=payload.api_key)
    return TestGeminiResponse(success=success, message=msg)
