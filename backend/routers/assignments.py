"""
GradeWise — Assignments Router
CRUD endpoints for assignments, rubric criteria, and requirements.
"""

from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.assignment import Assignment, Requirement, RubricCriterion, Teacher
from models.evaluation import Evaluation
from models.submission import Submission
from schemas.assignment import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentStatsResponse,
    AssignmentUpdate,
)

router = APIRouter()


async def get_or_create_default_teacher(db: AsyncSession) -> Teacher:
    res = await db.execute(select(Teacher))
    teacher = res.scalars().first()
    if not teacher:
        teacher = Teacher(
            name="Teacher",
            email="teacher@gradewise.local",
            grade_scale=[
                {"min_pct": 90, "label": "A"},
                {"min_pct": 80, "label": "B"},
                {"min_pct": 70, "label": "C"},
                {"min_pct": 60, "label": "D"},
                {"min_pct": 0, "label": "F"},
            ],
        )
        db.add(teacher)
        await db.commit()
        await db.refresh(teacher)
    return teacher


@router.post("", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    payload: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
):
    teacher = await get_or_create_default_teacher(db)

    # Convert grade_scale if provided
    grade_scale_data = (
        [g.model_dump() for g in payload.grade_scale]
        if payload.grade_scale
        else teacher.grade_scale
    )

    assignment = Assignment(
        teacher_id=teacher.id,
        title=payload.title,
        type=payload.type,
        instructions=payload.instructions,
        grading_notes=payload.grading_notes,
        feedback_instructions=payload.feedback_instructions,
        total_marks=payload.total_marks,
        grade_scale=grade_scale_data,
        status=payload.status,
    )
    db.add(assignment)
    await db.flush()

    for idx, c in enumerate(payload.rubric_criteria):
        crit = RubricCriterion(
            assignment_id=assignment.id,
            name=c.name,
            max_marks=c.max_marks,
            description=c.description,
            sort_order=c.sort_order if c.sort_order is not None else idx,
        )
        db.add(crit)

    for idx, r in enumerate(payload.requirements):
        req = Requirement(
            assignment_id=assignment.id,
            description=r.description,
            sort_order=r.sort_order if r.sort_order is not None else idx,
        )
        db.add(req)

    await db.commit()

    # Reload with relationships
    stmt = (
        select(Assignment)
        .options(
            selectinload(Assignment.rubric_criteria),
            selectinload(Assignment.requirements),
        )
        .where(Assignment.id == assignment.id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.get("", response_model=List[AssignmentStatsResponse])
async def list_assignments(
    filter_status: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Assignment)
        .options(
            selectinload(Assignment.submissions).selectinload(Submission.evaluation)
        )
        .order_by(Assignment.created_at.desc())
    )
    if filter_status and filter_status != "all":
        stmt = stmt.where(Assignment.status == filter_status)

    res = await db.execute(stmt)
    assignments = res.scalars().all()

    results = []
    for a in assignments:
        if search and search.lower() not in a.title.lower():
            continue

        submissions = a.submissions
        total_sub = len(submissions)
        approved = sum(1 for s in submissions if s.status == "approved")
        pending_review = sum(
            1 for s in submissions if s.evaluation and s.evaluation.eval_status == "pending_review"
        )
        errors = sum(
            1 for s in submissions if s.status in ("failed", "extraction_failed", "review_needed")
        )

        percentages = [s.evaluation.percentage for s in submissions if s.evaluation and s.evaluation.percentage is not None]
        avg_pct = round(sum(percentages) / len(percentages), 1) if percentages else None

        scores = [s.evaluation.total_score for s in submissions if s.evaluation and s.evaluation.total_score is not None]
        min_s = min(scores) if scores else None
        max_s = max(scores) if scores else None

        results.append(
            AssignmentStatsResponse(
                assignment_id=a.id,
                title=a.title,
                type=a.type,
                total_marks=a.total_marks,
                status=a.status,
                created_at=a.created_at,
                total_submissions=total_sub,
                approved_count=approved,
                pending_review_count=pending_review,
                error_count=errors,
                avg_percentage=avg_pct,
                min_score=min_s,
                max_score=max_s,
            )
        )

    return results


@router.get("/{id}", response_model=AssignmentResponse)
async def get_assignment(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Assignment)
        .options(
            selectinload(Assignment.rubric_criteria),
            selectinload(Assignment.requirements),
        )
        .where(Assignment.id == id)
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.put("/{id}", response_model=AssignmentResponse)
async def update_assignment(
    id: uuid.UUID,
    payload: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Assignment)
        .options(
            selectinload(Assignment.rubric_criteria),
            selectinload(Assignment.requirements),
        )
        .where(Assignment.id == id)
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if payload.title is not None:
        assignment.title = payload.title
    if payload.type is not None:
        assignment.type = payload.type
    if payload.instructions is not None:
        assignment.instructions = payload.instructions
    if payload.grading_notes is not None:
        assignment.grading_notes = payload.grading_notes
    if payload.feedback_instructions is not None:
        assignment.feedback_instructions = payload.feedback_instructions
    if payload.total_marks is not None:
        assignment.total_marks = payload.total_marks
    if payload.status is not None:
        assignment.status = payload.status
    if payload.grade_scale is not None:
        assignment.grade_scale = [g.model_dump() for g in payload.grade_scale]

    # Replace rubric criteria if specified
    if payload.rubric_criteria is not None:
        for c in list(assignment.rubric_criteria):
            await db.delete(c)
        for idx, c in enumerate(payload.rubric_criteria):
            crit = RubricCriterion(
                assignment_id=assignment.id,
                name=c.name,
                max_marks=c.max_marks,
                description=c.description,
                sort_order=c.sort_order if c.sort_order is not None else idx,
            )
            db.add(crit)

    # Replace requirements if specified
    if payload.requirements is not None:
        for r in list(assignment.requirements):
            await db.delete(r)
        for idx, r in enumerate(payload.requirements):
            req = Requirement(
                assignment_id=assignment.id,
                description=r.description,
                sort_order=r.sort_order if r.sort_order is not None else idx,
            )
            db.add(req)

    await db.commit()

    # Re-fetch
    stmt = (
        select(Assignment)
        .options(
            selectinload(Assignment.rubric_criteria),
            selectinload(Assignment.requirements),
        )
        .where(Assignment.id == id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_or_archive_assignment(
    id: uuid.UUID,
    archive_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Assignment).where(Assignment.id == id))
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if archive_only:
        assignment.status = "archived"
        await db.commit()
        return {"status": "archived", "assignment_id": str(id)}
    else:
        await db.delete(assignment)
        await db.commit()
        return {"status": "deleted", "assignment_id": str(id)}
