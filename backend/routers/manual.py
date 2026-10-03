"""
GradeWise — Manual Paste Router (Module 2)
Fast, synchronous workflow for individual student evaluations with custom session settings.
"""

from datetime import datetime
import os
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from config import settings
from database import get_db
from models.assignment import Teacher
from models.manual import ManualEvaluation, ManualSession
from schemas.manual import (
    ManualEvaluateRequest,
    ManualEvaluationResponse,
    ManualEvaluationUpdate,
    ManualSessionCreate,
    ManualSessionDetailResponse,
    ManualSessionResponse,
    ManualSessionUpdate,
)
from services.export_service import export_service, sanitize_filename
from services.gemini_service import gemini_service

log = structlog.get_logger()
router = APIRouter()


async def get_current_teacher(db: AsyncSession) -> Teacher:
    """Helper to retrieve default teacher for single-user dev environment."""
    res = await db.execute(select(Teacher))
    teacher = res.scalars().first()
    if not teacher:
        teacher = Teacher(name="Teacher", email="teacher@gradewise.local")
        db.add(teacher)
        await db.commit()
        await db.refresh(teacher)
    return teacher


# -------------------------------------------------------------
# 1. SESSIONS CRUD
# -------------------------------------------------------------

@router.post("/sessions", response_model=ManualSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: ManualSessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Creates a new manual evaluation session with saved requirements and feedback instructions."""
    teacher = await get_current_teacher(db)

    reqs_data = [r.model_dump() for r in payload.requirements] if payload.requirements else []

    session = ManualSession(
        teacher_id=teacher.id,
        title=payload.title,
        assignment_type=payload.assignment_type or "general",
        instructions=payload.instructions,
        requirements=reqs_data,
        feedback_instructions=payload.feedback_instructions,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return ManualSessionResponse(
        id=session.id,
        teacher_id=session.teacher_id,
        title=session.title,
        assignment_type=session.assignment_type,
        instructions=session.instructions,
        requirements=session.requirements or [],
        feedback_instructions=session.feedback_instructions,
        evaluations_count=0,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("/sessions", response_model=List[ManualSessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
):
    """Lists all manual evaluation sessions with evaluation counts."""
    # Query sessions with counts
    stmt = (
        select(
            ManualSession,
            func.count(ManualEvaluation.id).label("eval_count"),
        )
        .outerjoin(ManualEvaluation, ManualSession.id == ManualEvaluation.session_id)
        .group_by(ManualSession.id)
        .order_by(ManualSession.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    results = []
    for session, count in rows:
        results.append(
            ManualSessionResponse(
                id=session.id,
                teacher_id=session.teacher_id,
                title=session.title,
                assignment_type=session.assignment_type,
                instructions=session.instructions,
                requirements=session.requirements or [],
                feedback_instructions=session.feedback_instructions,
                evaluations_count=count,
                created_at=session.created_at,
                updated_at=session.updated_at,
            )
        )
    return results


@router.get("/sessions/{id}", response_model=ManualSessionDetailResponse)
async def get_session(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieves session details and all historical evaluations."""
    stmt = (
        select(ManualSession)
        .options(selectinload(ManualSession.evaluations))
        .where(ManualSession.id == id)
    )
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Manual session not found")

    return ManualSessionDetailResponse(
        id=session.id,
        teacher_id=session.teacher_id,
        title=session.title,
        assignment_type=session.assignment_type,
        instructions=session.instructions,
        requirements=session.requirements or [],
        feedback_instructions=session.feedback_instructions,
        created_at=session.created_at,
        updated_at=session.updated_at,
        evaluations=[
            ManualEvaluationResponse.model_validate(ev)
            for ev in session.evaluations
        ],
    )


@router.put("/sessions/{id}", response_model=ManualSessionResponse)
async def update_session(
    id: uuid.UUID,
    payload: ManualSessionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Updates settings for an active manual session."""
    stmt = select(ManualSession).where(ManualSession.id == id)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Manual session not found")

    if payload.title is not None:
        session.title = payload.title
    if payload.assignment_type is not None:
        session.assignment_type = payload.assignment_type
    if payload.instructions is not None:
        session.instructions = payload.instructions
    if payload.requirements is not None:
        session.requirements = [r.model_dump() for r in payload.requirements]
    if payload.feedback_instructions is not None:
        session.feedback_instructions = payload.feedback_instructions

    session.updated_at = datetime.now()
    await db.commit()
    await db.refresh(session)

    # Get count
    count_stmt = select(func.count(ManualEvaluation.id)).where(ManualEvaluation.session_id == id)
    c_res = await db.execute(count_stmt)
    cnt = c_res.scalar() or 0

    return ManualSessionResponse(
        id=session.id,
        teacher_id=session.teacher_id,
        title=session.title,
        assignment_type=session.assignment_type,
        instructions=session.instructions,
        requirements=session.requirements or [],
        feedback_instructions=session.feedback_instructions,
        evaluations_count=cnt,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.delete("/sessions/{id}")
async def delete_session(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Deletes session and all associated evaluations."""
    stmt = select(ManualSession).where(ManualSession.id == id)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Manual session not found")

    await db.delete(session)
    await db.commit()
    return {"status": "deleted", "id": str(id)}


# -------------------------------------------------------------
# 2. EVALUATION EXECUTION
# -------------------------------------------------------------

@router.post("/sessions/{id}/evaluate", response_model=ManualEvaluationResponse)
async def evaluate_manual_submission(
    id: uuid.UUID,
    payload: ManualEvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Evaluates a single manual paste submission synchronously and quickly.
    Returns complete result immediately so teacher can copy feedback right away.
    """
    stmt = select(ManualSession).where(ManualSession.id == id)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Manual session not found")

    if not gemini_service.is_configured():
        raise HTTPException(
            status_code=400,
            detail="Gemini API key is invalid or not configured. Please update it in Settings.",
        )

    # Count words
    clean_text = payload.submission_text.strip()
    words = clean_text.split()
    word_count = len(words)

    try:
        eval_result = await gemini_service.evaluate_manual_submission(
            student_name=payload.student_name.strip(),
            submission_text=clean_text,
            assignment_title=session.title,
            assignment_type=session.assignment_type,
            instructions=session.instructions,
            requirements=session.requirements or [],
            feedback_instructions=session.feedback_instructions,
            word_count=word_count,
        )

        data = eval_result["data"]
        evaluation = ManualEvaluation(
            session_id=session.id,
            student_name=payload.student_name.strip(),
            submission_text=clean_text,
            word_count=word_count,
            requirements_result=data.get("requirements", []),
            writing_quality_summary=data.get("writing_quality_summary", ""),
            strengths=data.get("strengths", []),
            improvements=data.get("improvements", []),
            ai_feedback=data.get("teacher_feedback", ""),
            teacher_feedback=data.get("teacher_feedback", ""),
            gemini_model=eval_result.get("model"),
            status="complete",
        )
        db.add(evaluation)
        await db.commit()
        await db.refresh(evaluation)

        return ManualEvaluationResponse.model_validate(evaluation)

    except Exception as e:
        log.error("Manual evaluation failed", error=str(e), student_name=payload.student_name)
        # Create failed evaluation entry if desired, or raise clean HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"Evaluation failed: {str(e)}",
        )


@router.put("/evaluations/{id}", response_model=ManualEvaluationResponse)
async def update_evaluation(
    id: uuid.UUID,
    payload: ManualEvaluationUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Updates teacher feedback for an existing evaluation."""
    stmt = select(ManualEvaluation).where(ManualEvaluation.id == id)
    res = await db.execute(stmt)
    evaluation = res.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    if payload.teacher_feedback is not None:
        evaluation.teacher_feedback = payload.teacher_feedback
        evaluation.updated_at = datetime.now()

    await db.commit()
    await db.refresh(evaluation)
    return ManualEvaluationResponse.model_validate(evaluation)


@router.delete("/evaluations/{id}")
async def delete_evaluation(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Deletes a single manual evaluation record."""
    stmt = select(ManualEvaluation).where(ManualEvaluation.id == id)
    res = await db.execute(stmt)
    evaluation = res.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    await db.delete(evaluation)
    await db.commit()
    return {"status": "deleted", "id": str(id)}


# -------------------------------------------------------------
# 3. EXPORT SESSION
# -------------------------------------------------------------

@router.get("/sessions/{id}/export")
async def export_manual_session(
    id: uuid.UUID,
    format: str = Query("csv", pattern="^(csv|pdf|docx)$"),
    db: AsyncSession = Depends(get_db),
):
    """Exports all evaluations for this session as CSV, PDF, or DOCX."""
    stmt = (
        select(ManualSession)
        .options(selectinload(ManualSession.evaluations))
        .where(ManualSession.id == id)
    )
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Manual session not found")

    evaluations = session.evaluations or []
    if not evaluations:
        raise HTTPException(
            status_code=400,
            detail="No evaluations to export in this session.",
        )

    export_dir = os.path.join(settings.EXPORT_DIR, f"manual_{session.id}")
    os.makedirs(export_dir, exist_ok=True)
    base_name = sanitize_filename(session.title or "manual_session")

    if format == "csv":
        out_file = os.path.join(export_dir, f"{base_name}_evaluations.csv")
        export_service.generate_manual_session_csv(session.title, evaluations, out_file)
        return FileResponse(
            out_file,
            media_type="text/csv",
            filename=f"{base_name}_evaluations.csv",
        )

    elif format == "docx":
        out_file = os.path.join(export_dir, f"{base_name}_evaluations.docx")
        export_service.generate_manual_session_docx(session.title, session.assignment_type, evaluations, out_file)
        return FileResponse(
            out_file,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{base_name}_evaluations.docx",
        )

    elif format == "pdf":
        out_file = os.path.join(export_dir, f"{base_name}_evaluations.pdf")
        export_service.generate_manual_session_pdf(session.title, session.assignment_type, evaluations, out_file)
        return FileResponse(
            out_file,
            media_type="application/pdf",
            filename=f"{base_name}_evaluations.pdf",
        )

    raise HTTPException(status_code=400, detail="Unsupported export format")
