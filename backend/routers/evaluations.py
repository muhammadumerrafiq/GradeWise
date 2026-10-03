"""
GradeWise — Evaluations Router
Batch evaluation orchestration, single submission retry/regenerate, evaluation review & approval.
"""

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from database import AsyncSessionLocal, get_db
from models.assignment import Assignment, RubricCriterion
from models.evaluation import CriterionScore, Evaluation
from models.submission import Submission
from schemas.evaluation import (
    EvaluationResponse,
    EvaluationUpdate,
)
from services.gemini_service import gemini_service
from services.progress_tracker import tracker

log = structlog.get_logger()

# Router for /api/evaluations
evaluations_router = APIRouter()

# Router for /api/assignments
batch_eval_router = APIRouter()

# Router for /api/submissions
submission_retry_router = APIRouter()


def compute_grade_label(percentage: float, grade_scale: Optional[List[Dict[str, Any]]]) -> str:
    if not grade_scale:
        grade_scale = [
            {"min_pct": 90, "label": "A"},
            {"min_pct": 80, "label": "B"},
            {"min_pct": 70, "label": "C"},
            {"min_pct": 60, "label": "D"},
            {"min_pct": 0, "label": "F"},
        ]
    sorted_scale = sorted(grade_scale, key=lambda x: x.get("min_pct", 0), reverse=True)
    for entry in sorted_scale:
        if percentage >= entry.get("min_pct", 0):
            return entry.get("label", "")
    return "F"


async def evaluate_single_submission_task(
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    assignment_data: Dict[str, Any],
):
    """Worker task to evaluate a single submission, store results in DB, and update progress."""
    async with AsyncSessionLocal() as session:
        # Load submission
        res = await session.execute(
            select(Submission)
            .options(selectinload(Submission.student))
            .where(Submission.id == submission_id)
        )
        submission = res.scalar_one_or_none()
        if not submission:
            return

        student_name = submission.student.name if submission.student else (submission.detected_name or submission.original_filename)
        tracker.start_submission(str(assignment_id), student_name)

        # Check if cancelled
        if tracker.is_cancelled(str(assignment_id)):
            submission.status = "failed"
            submission.error_message = "Evaluation was cancelled."
            await session.commit()
            tracker.fail_submission(str(assignment_id), student_name, str(submission_id), "Evaluation cancelled")
            return

        # Check pause loop
        while tracker.is_paused(str(assignment_id)):
            await asyncio.sleep(1)
            if tracker.is_cancelled(str(assignment_id)):
                return

        submission.status = "processing"
        await session.commit()

        try:
            eval_result = await gemini_service.evaluate_submission(
                submission_id=str(submission_id),
                assignment_title=assignment_data["title"],
                assignment_type=assignment_data["type"],
                total_marks=assignment_data["total_marks"],
                instructions=assignment_data.get("instructions"),
                grading_notes=assignment_data.get("grading_notes"),
                feedback_instructions=assignment_data.get("feedback_instructions"),
                rubric_criteria=assignment_data["rubric_criteria"],
                requirements=assignment_data["requirements"],
                extracted_text=submission.extracted_text or "",
                word_count=submission.word_count or 0,
            )

            # Check existing evaluation
            eval_res = await session.execute(
                select(Evaluation)
                .options(selectinload(Evaluation.criterion_scores))
                .where(Evaluation.submission_id == submission_id)
            )
            evaluation = eval_res.scalar_one_or_none()

            if eval_result["success"]:
                data = eval_result["data"]
                total_score = data["total_score"]
                max_score = data["max_score"]
                pct = data["percentage"]
                grade = compute_grade_label(pct, assignment_data.get("grade_scale"))

                if not evaluation:
                    evaluation = Evaluation(
                        submission_id=submission_id,
                        total_score=total_score,
                        max_score=max_score,
                        percentage=pct,
                        grade_label=grade,
                        requirements_result=data["requirements"],
                        english_analysis=data["english_analysis"],
                        strengths=data["strengths"],
                        improvements=data["improvements"],
                        ai_feedback=data["teacher_feedback"],
                        teacher_feedback=data["teacher_feedback"],
                        eval_status="pending_review",
                        gemini_model=eval_result["model"],
                        prompt_tokens=eval_result["prompt_tokens"],
                        completion_tokens=eval_result["completion_tokens"],
                        raw_gemini_response=eval_result["raw_response"],
                        generated_at=datetime.now(),
                    )
                    session.add(evaluation)
                    await session.flush()
                else:
                    evaluation.total_score = total_score
                    evaluation.max_score = max_score
                    evaluation.percentage = pct
                    evaluation.grade_label = grade
                    evaluation.requirements_result = data["requirements"]
                    evaluation.english_analysis = data["english_analysis"]
                    evaluation.strengths = data["strengths"]
                    evaluation.improvements = data["improvements"]
                    evaluation.ai_feedback = data["teacher_feedback"]
                    evaluation.teacher_feedback = data["teacher_feedback"]
                    evaluation.eval_status = "pending_review"
                    evaluation.gemini_model = eval_result["model"]
                    evaluation.prompt_tokens = eval_result["prompt_tokens"]
                    evaluation.completion_tokens = eval_result["completion_tokens"]
                    evaluation.raw_gemini_response = eval_result["raw_response"]
                    evaluation.generated_at = datetime.now()

                    # Clear old criteria scores
                    for cs in list(evaluation.criterion_scores):
                        await session.delete(cs)
                    await session.flush()

                # Add criterion scores
                for cs in data["criterion_scores"]:
                    crit_obj = CriterionScore(
                        evaluation_id=evaluation.id,
                        criterion_id=cs["criterion_id"],
                        criterion_name=cs["criterion_name"],
                        score=cs["score"],
                        max_score=cs["max_score"],
                        rationale=cs.get("rationale"),
                        evidence=cs.get("evidence"),
                    )
                    session.add(crit_obj)

                submission.status = "evaluated"
                submission.error_message = None
                await session.commit()

                tracker.complete_submission(
                    str(assignment_id),
                    student_name,
                    score=total_score,
                    max_score=max_score,
                )

            else:
                # Validation failed after 3 attempts: set review_needed
                submission.status = "review_needed"
                submission.error_message = eval_result["error"]
                await session.commit()
                tracker.fail_submission(
                    str(assignment_id),
                    student_name,
                    str(submission_id),
                    eval_result["error"],
                )

        except Exception as e:
            err_msg = str(e)
            log.error("Single submission evaluation failed", submission_id=str(submission_id), error=err_msg)
            submission.status = "failed"
            submission.error_message = err_msg
            await session.commit()
            tracker.fail_submission(str(assignment_id), student_name, str(submission_id), err_msg)


async def run_batch_evaluation_task(assignment_id: uuid.UUID, submission_ids: List[uuid.UUID]):
    """Orchestrates concurrent evaluations for an assignment."""
    async with AsyncSessionLocal() as session:
        # Load assignment details
        stmt = (
            select(Assignment)
            .options(
                selectinload(Assignment.rubric_criteria),
                selectinload(Assignment.requirements),
            )
            .where(Assignment.id == assignment_id)
        )
        res = await session.execute(stmt)
        assignment = res.scalar_one_or_none()
        if not assignment:
            return

        assignment_data = {
            "title": assignment.title,
            "type": assignment.type,
            "total_marks": assignment.total_marks,
            "instructions": assignment.instructions,
            "grading_notes": assignment.grading_notes,
            "feedback_instructions": assignment.feedback_instructions,
            "grade_scale": assignment.grade_scale,
            "rubric_criteria": [
                {
                    "id": c.id,
                    "name": c.name,
                    "max_marks": c.max_marks,
                    "description": c.description,
                }
                for c in assignment.rubric_criteria
            ],
            "requirements": [
                {
                    "id": r.id,
                    "description": r.description,
                }
                for r in assignment.requirements
            ],
        }

    # Execute all submissions concurrently (controlled by semaphore inside gemini_service)
    tasks = [
        evaluate_single_submission_task(assignment_id, sub_id, assignment_data)
        for sub_id in submission_ids
    ]
    await asyncio.gather(*tasks, return_exceptions=True)


# ============================================================
# BATCH EVALUATION ROUTES (/api/assignments/{assignment_id}/...)
# ============================================================

@batch_eval_router.post("/{assignment_id}/evaluate")
async def start_batch_evaluation(
    assignment_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Starts the evaluation batch for all ready submissions in this assignment."""
    if not gemini_service.is_configured():
        raise HTTPException(
            status_code=400,
            detail="Gemini API key is invalid or not configured. Please update it in Settings.",
        )

    # Check for flagged submissions
    flagged_stmt = select(Submission).where(
        Submission.assignment_id == assignment_id,
        Submission.name_flagged == True,
    )
    flagged_res = await db.execute(flagged_stmt)
    flagged_list = flagged_res.scalars().all()
    if flagged_list:
        raise HTTPException(
            status_code=400,
            detail=f"{len(flagged_list)} student names are flagged and require confirmation before evaluation can start.",
        )

    # Get submissions to evaluate
    stmt = (
        select(Submission)
        .options(selectinload(Submission.student))
        .where(
            Submission.assignment_id == assignment_id,
            Submission.status.in_(["pending", "failed", "review_needed"]),
        )
    )
    res = await db.execute(stmt)
    submissions = res.scalars().all()

    if not submissions:
        raise HTTPException(
            status_code=400,
            detail="No eligible submissions found to evaluate.",
        )

    submission_names = [
        s.student.name if s.student else (s.detected_name or s.original_filename)
        for s in submissions
    ]
    sub_ids = [s.id for s in submissions]

    tracker.init_job(str(assignment_id), submission_names)
    background_tasks.add_task(run_batch_evaluation_task, assignment_id, sub_ids)

    return {
        "status": "started",
        "assignment_id": str(assignment_id),
        "total_queued": len(sub_ids),
    }


@batch_eval_router.get("/{assignment_id}/progress")
async def get_batch_progress(assignment_id: uuid.UUID):
    """Polls processing progress for the specified assignment."""
    progress = tracker.get_progress(str(assignment_id))
    if not progress:
        return {
            "assignment_id": str(assignment_id),
            "status": "completed",
            "total_count": 0,
            "completed_count": 0,
            "failed_count": 0,
            "current_name": None,
            "completed_list": [],
            "queued_names": [],
            "errors": [],
            "estimated_seconds_remaining": 0,
        }
    return progress


@batch_eval_router.post("/{assignment_id}/pause")
async def pause_batch(assignment_id: uuid.UUID):
    tracker.pause_job(str(assignment_id))
    return {"status": "paused"}


@batch_eval_router.post("/{assignment_id}/resume")
async def resume_batch(assignment_id: uuid.UUID):
    tracker.resume_job(str(assignment_id))
    return {"status": "resumed"}


@batch_eval_router.post("/{assignment_id}/cancel")
async def cancel_batch(assignment_id: uuid.UUID):
    tracker.cancel_job(str(assignment_id))
    return {"status": "cancelled"}


# ============================================================
# EVALUATION DETAIL & REVIEW ROUTES (/api/evaluations/...)
# ============================================================

@evaluations_router.get("/{id}", response_model=EvaluationResponse)
async def get_evaluation_detail(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Full evaluation detail for Student Detail split view."""
    stmt = (
        select(Evaluation)
        .options(
            selectinload(Evaluation.criterion_scores),
            selectinload(Evaluation.submission).selectinload(Submission.student),
        )
        .where(Evaluation.id == id)
    )
    res = await db.execute(stmt)
    evaluation = res.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return evaluation


@evaluations_router.put("/{id}", response_model=EvaluationResponse)
async def update_evaluation(
    id: uuid.UUID,
    payload: EvaluationUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Updates scores, feedback, or private notes.
    Recalculates totals and percentages on score changes.
    Supports debounced auto-save from frontend.
    """
    stmt = (
        select(Evaluation)
        .options(
            selectinload(Evaluation.criterion_scores),
            selectinload(Evaluation.submission).selectinload(Submission.assignment),
        )
        .where(Evaluation.id == id)
    )
    res = await db.execute(stmt)
    evaluation = res.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    assignment = evaluation.submission.assignment

    if payload.teacher_feedback is not None:
        evaluation.teacher_feedback = payload.teacher_feedback
        if evaluation.eval_status == "pending_review":
            evaluation.eval_status = "reviewed"

    if payload.teacher_notes is not None:
        evaluation.teacher_notes = payload.teacher_notes

    if payload.eval_status is not None:
        evaluation.eval_status = payload.eval_status
        if payload.eval_status == "approved":
            evaluation.approved_at = datetime.now()
            evaluation.submission.status = "approved"

    # Update criterion scores if supplied
    if payload.criterion_scores is not None:
        score_by_id = {cs.criterion_id: cs for cs in payload.criterion_scores}
        total = 0
        for cs_model in evaluation.criterion_scores:
            if cs_model.criterion_id in score_by_id:
                update_item = score_by_id[cs_model.criterion_id]
                cs_model.score = update_item.score
                if update_item.rationale is not None:
                    cs_model.rationale = update_item.rationale
                if update_item.evidence is not None:
                    cs_model.evidence = update_item.evidence
            total += cs_model.score

        evaluation.total_score = total
        pct = round((total / evaluation.max_score) * 100.0, 1) if evaluation.max_score > 0 else 0.0
        evaluation.percentage = pct
        evaluation.grade_label = compute_grade_label(pct, assignment.grade_scale)
        if evaluation.eval_status == "pending_review":
            evaluation.eval_status = "reviewed"

    await db.commit()

    # Re-fetch
    stmt = (
        select(Evaluation)
        .options(
            selectinload(Evaluation.criterion_scores),
            selectinload(Evaluation.submission).selectinload(Submission.student),
        )
        .where(Evaluation.id == id)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@evaluations_router.post("/{id}/approve", response_model=EvaluationResponse)
async def approve_evaluation(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Approves an evaluation, updating both evaluation and submission statuses."""
    stmt = (
        select(Evaluation)
        .options(
            selectinload(Evaluation.criterion_scores),
            selectinload(Evaluation.submission).selectinload(Submission.student),
        )
        .where(Evaluation.id == id)
    )
    res = await db.execute(stmt)
    evaluation = res.scalar_one_or_none()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    evaluation.eval_status = "approved"
    evaluation.approved_at = datetime.now()
    evaluation.submission.status = "approved"
    await db.commit()
    await db.refresh(evaluation)
    return evaluation


# ============================================================
# SUBMISSION RETRY / REGENERATE ROUTES (/api/submissions/...)
# ============================================================

@submission_retry_router.post("/{submission_id}/retry")
async def retry_submission_evaluation(
    submission_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Retries a failed or review_needed submission."""
    if not gemini_service.is_configured():
        raise HTTPException(status_code=400, detail="Gemini API key is not configured.")

    stmt = (
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.assignment).selectinload(Assignment.rubric_criteria),
            selectinload(Submission.assignment).selectinload(Assignment.requirements),
        )
        .where(Submission.id == submission_id)
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    assignment = sub.assignment
    assignment_data = {
        "title": assignment.title,
        "type": assignment.type,
        "total_marks": assignment.total_marks,
        "instructions": assignment.instructions,
        "grading_notes": assignment.grading_notes,
        "feedback_instructions": assignment.feedback_instructions,
        "grade_scale": assignment.grade_scale,
        "rubric_criteria": [
            {
                "id": c.id,
                "name": c.name,
                "max_marks": c.max_marks,
                "description": c.description,
            }
            for c in assignment.rubric_criteria
        ],
        "requirements": [
            {
                "id": r.id,
                "description": r.description,
            }
            for r in assignment.requirements
        ],
    }

    sub.status = "processing"
    sub.retry_count += 1
    await db.commit()

    student_name = sub.student.name if sub.student else (sub.detected_name or sub.original_filename)
    tracker.init_job(str(assignment.id), [student_name])

    background_tasks.add_task(
        evaluate_single_submission_task,
        assignment.id,
        sub.id,
        assignment_data,
    )

    return {"status": "retrying", "submission_id": str(sub.id)}


@submission_retry_router.post("/{submission_id}/regenerate")
async def regenerate_submission_evaluation(
    submission_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    regenerate_type: str = Query("full", pattern="^(full|feedback)$"),
    db: AsyncSession = Depends(get_db),
):
    """Regenerates either full evaluation or feedback only."""
    return await retry_submission_evaluation(submission_id, background_tasks, db)
