"""
GradeWise — Results Router
Provides filterable, sortable results table data and score distributions.
"""

from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.assignment import Assignment
from models.evaluation import Evaluation
from models.submission import Submission
from schemas.evaluation import ResultsListResponse, SubmissionResultRow

router = APIRouter()


@router.get("/{assignment_id}/results", response_model=ResultsListResponse)
async def get_assignment_results(
    assignment_id: uuid.UUID,
    status_filter: Optional[str] = Query("all", alias="status"),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("score_desc"),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns results table data with filters, search, sorting,
    and text-only score distribution summary.
    """
    assign_stmt = select(Assignment).where(Assignment.id == assignment_id)
    assign_res = await db.execute(assign_stmt)
    assignment = assign_res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Fetch all submissions for assignment with student and evaluation
    stmt = (
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.evaluation),
        )
        .where(Submission.assignment_id == assignment_id)
    )
    res = await db.execute(stmt)
    all_submissions = res.scalars().all()

    # Calculate global distribution counts across all submissions before filtering
    count_a = 0
    count_b = 0
    count_c = 0
    count_below_70 = 0
    count_errors = 0

    for s in all_submissions:
        if s.status in ("failed", "extraction_failed", "review_needed") or (s.error_message and not s.evaluation):
            count_errors += 1
        elif s.evaluation and s.evaluation.percentage is not None:
            p = s.evaluation.percentage
            if p >= 90:
                count_a += 1
            elif p >= 80:
                count_b += 1
            elif p >= 70:
                count_c += 1
            else:
                count_below_70 += 1

    distribution_summary = (
        f"A (90%+): {count_a}   B (80-89%): {count_b}   C (70-79%): {count_c}   "
        f"Below 70: {count_below_70}   Errors: {count_errors}"
    )

    rows: List[SubmissionResultRow] = []

    for s in all_submissions:
        student_name = s.student.name if s.student else (s.detected_name or "Unknown")
        ev = s.evaluation

        # Determine effective row status
        row_status = s.status
        if ev:
            row_status = ev.eval_status  # pending_review, reviewed, approved
        elif s.status in ("failed", "extraction_failed", "review_needed"):
            row_status = "error"

        # Apply status filter
        if status_filter and status_filter != "all":
            if status_filter == "errors":
                if row_status not in ("error", "failed", "extraction_failed", "review_needed"):
                    continue
            elif status_filter == "pending_review":
                if row_status != "pending_review":
                    continue
            elif status_filter == "reviewed":
                if row_status != "reviewed":
                    continue
            elif status_filter == "approved":
                if row_status != "approved":
                    continue

        # Apply search filter
        if search:
            q = search.lower().strip()
            if q not in student_name.lower() and q not in s.original_filename.lower():
                continue

        row = SubmissionResultRow(
            submission_id=s.id,
            assignment_id=assignment.id,
            student_id=s.student_id,
            student_name=student_name,
            original_filename=s.original_filename,
            word_count=s.word_count,
            status=row_status,
            evaluation_id=ev.id if ev else None,
            total_score=ev.total_score if ev else None,
            max_score=ev.max_score if ev else assignment.total_marks,
            percentage=ev.percentage if ev else None,
            grade_label=ev.grade_label if ev else None,
            eval_status=ev.eval_status if ev else None,
            teacher_feedback=ev.teacher_feedback if ev else None,
            error_message=s.error_message,
            uploaded_at=s.uploaded_at,
            generated_at=ev.generated_at if ev else None,
            approved_at=ev.approved_at if ev else None,
        )
        rows.append(row)

    # Sort rows
    if sort_by == "name":
        rows.sort(key=lambda x: x.student_name.lower())
    elif sort_by == "score_desc":
        rows.sort(key=lambda x: (x.total_score is not None, x.total_score or -1), reverse=True)
    elif sort_by == "score_asc":
        rows.sort(key=lambda x: (x.total_score is None, x.total_score or 0))
    elif sort_by == "percentage":
        rows.sort(key=lambda x: (x.percentage is not None, x.percentage or -1), reverse=True)
    elif sort_by == "status":
        rows.sort(key=lambda x: x.status)

    return ResultsListResponse(
        items=rows,
        total=len(rows),
        distribution_summary=distribution_summary,
    )
