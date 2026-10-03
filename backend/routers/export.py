"""
GradeWise — Export Router
Endpoints for generating individual reports, Excel/CSV summaries, and Bulk ZIPs.
"""

from datetime import datetime
import os
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models.assignment import Assignment
from models.evaluation import Evaluation
from models.export import Export
from models.submission import Submission
from schemas.export import ExportRequest, ExportResponse
from services.export_service import export_service, sanitize_filename

router = APIRouter()


@router.post("/assignments/{assignment_id}/export", response_model=ExportResponse)
async def generate_assignment_export(
    assignment_id: uuid.UUID,
    payload: ExportRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generates PDF/DOCX reports, Excel/CSV summaries, or a Bulk ZIP of all reports.
    """
    stmt = (
        select(Assignment)
        .options(
            selectinload(Assignment.rubric_criteria),
            selectinload(Assignment.requirements),
        )
        .where(Assignment.id == assignment_id)
    )
    res = await db.execute(stmt)
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Fetch submissions with evaluations
    sub_stmt = (
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.evaluation).selectinload(Evaluation.criterion_scores),
        )
        .where(Submission.assignment_id == assignment_id)
    )
    if payload.submission_ids:
        sub_stmt = sub_stmt.where(Submission.id.in_(payload.submission_ids))

    sub_res = await db.execute(sub_stmt)
    submissions = sub_res.scalars().all()

    evaluated_submissions = [s for s in submissions if s.evaluation]
    if not evaluated_submissions:
        raise HTTPException(
            status_code=400,
            detail="No evaluated submissions available for export.",
        )

    export_dir = export_service.get_assignment_export_dir(str(assignment_id))
    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    clean_title = sanitize_filename(assignment.title)

    generated_file_path = ""
    export_type = payload.export_type

    # Format 1: Excel Summary
    if export_type == "excel_summary":
        excel_name = f"{clean_title}_summary_{date_str}.xlsx"
        generated_file_path = os.path.join(export_dir, excel_name)
        rubric_names = [c.name for c in assignment.rubric_criteria]

        results_data = []
        for s in evaluated_submissions:
            ev = s.evaluation
            s_name = s.student.name if s.student else (s.detected_name or "Unknown")
            crit_scores = [
                {
                    "criterion_name": cs.criterion_name,
                    "score": cs.score,
                    "max_score": cs.max_score,
                }
                for cs in ev.criterion_scores
            ]
            results_data.append({
                "student_name": s_name,
                "total_score": ev.total_score,
                "max_score": ev.max_score,
                "percentage": ev.percentage or 0.0,
                "grade_label": ev.grade_label or "",
                "criterion_scores": crit_scores,
                "eval_status": ev.eval_status,
                "teacher_feedback": ev.teacher_feedback or "",
            })

        export_service.generate_excel_summary(
            assignment_title=assignment.title,
            rubric_criteria_names=rubric_names,
            results=results_data,
            output_path=generated_file_path,
        )

    # Format 2: CSV Summary
    elif export_type == "csv_summary":
        csv_name = f"{clean_title}_summary_{date_str}.csv"
        generated_file_path = os.path.join(export_dir, csv_name)
        rubric_names = [c.name for c in assignment.rubric_criteria]

        results_data = []
        for s in evaluated_submissions:
            ev = s.evaluation
            s_name = s.student.name if s.student else (s.detected_name or "Unknown")
            crit_scores = [
                {
                    "criterion_name": cs.criterion_name,
                    "score": cs.score,
                    "max_score": cs.max_score,
                }
                for cs in ev.criterion_scores
            ]
            results_data.append({
                "student_name": s_name,
                "total_score": ev.total_score,
                "max_score": ev.max_score,
                "percentage": ev.percentage or 0.0,
                "grade_label": ev.grade_label or "",
                "criterion_scores": crit_scores,
                "eval_status": ev.eval_status,
                "teacher_feedback": ev.teacher_feedback or "",
            })

        export_service.generate_csv_summary(
            rubric_criteria_names=rubric_names,
            results=results_data,
            output_path=generated_file_path,
        )

    # Format 3: Individual PDF or Bulk ZIP (PDF)
    elif export_type in ("individual_pdf", "bulk_zip_pdf", "bulk_zip"):
        pdf_paths = []
        for s in evaluated_submissions:
            ev = s.evaluation
            s_name = s.student.name if s.student else (s.detected_name or "Unknown")
            clean_s_name = sanitize_filename(s_name)
            pdf_name = f"{clean_s_name}_{clean_title}_evaluation.pdf"
            p_path = os.path.join(export_dir, pdf_name)

            crit_list = [
                {
                    "criterion_name": cs.criterion_name,
                    "score": cs.score,
                    "max_score": cs.max_score,
                    "rationale": cs.rationale,
                    "evidence": cs.evidence,
                }
                for cs in ev.criterion_scores
            ]

            eval_date = (ev.generated_at or datetime.now()).strftime("%B %d, %Y")
            export_service.generate_pdf_report(
                student_name=s_name,
                assignment_title=assignment.title,
                total_score=ev.total_score,
                max_score=ev.max_score,
                percentage=ev.percentage or 0.0,
                grade_label=ev.grade_label or "",
                criterion_scores=crit_list,
                requirements=ev.requirements_result or [],
                english_analysis=ev.english_analysis or {},
                strengths=ev.strengths or [],
                improvements=ev.improvements or [],
                teacher_feedback=ev.teacher_feedback or "",
                evaluated_date=eval_date,
                output_path=p_path,
            )
            pdf_paths.append(p_path)

        if export_type == "individual_pdf" and len(pdf_paths) == 1:
            generated_file_path = pdf_paths[0]
        else:
            # Package into ZIP
            zip_name = f"{clean_title}_results_{date_str}.zip"
            zip_path = os.path.join(export_dir, zip_name)
            export_service.create_bulk_zip(pdf_paths, zip_path)
            generated_file_path = zip_path
            export_type = "bulk_zip_pdf"

    # Format 4: Individual DOCX or Bulk ZIP (DOCX)
    elif export_type in ("individual_docx", "bulk_zip_docx"):
        docx_paths = []
        for s in evaluated_submissions:
            ev = s.evaluation
            s_name = s.student.name if s.student else (s.detected_name or "Unknown")
            clean_s_name = sanitize_filename(s_name)
            docx_name = f"{clean_s_name}_{clean_title}_evaluation.docx"
            d_path = os.path.join(export_dir, docx_name)

            crit_list = [
                {
                    "criterion_name": cs.criterion_name,
                    "score": cs.score,
                    "max_score": cs.max_score,
                    "rationale": cs.rationale,
                    "evidence": cs.evidence,
                }
                for cs in ev.criterion_scores
            ]
            eval_date = (ev.generated_at or datetime.now()).strftime("%B %d, %Y")

            export_service.generate_docx_report(
                student_name=s_name,
                assignment_title=assignment.title,
                total_score=ev.total_score,
                max_score=ev.max_score,
                percentage=ev.percentage or 0.0,
                grade_label=ev.grade_label or "",
                criterion_scores=crit_list,
                requirements=ev.requirements_result or [],
                english_analysis=ev.english_analysis or {},
                strengths=ev.strengths or [],
                improvements=ev.improvements or [],
                teacher_feedback=ev.teacher_feedback or "",
                evaluated_date=eval_date,
                output_path=d_path,
            )
            docx_paths.append(d_path)

        if export_type == "individual_docx" and len(docx_paths) == 1:
            generated_file_path = docx_paths[0]
        else:
            zip_name = f"{clean_title}_docx_results_{date_str}.zip"
            zip_path = os.path.join(export_dir, zip_name)
            export_service.create_bulk_zip(docx_paths, zip_path)
            generated_file_path = zip_path
            export_type = "bulk_zip_docx"

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported export type: {export_type}")

    file_size = os.path.getsize(generated_file_path) if os.path.exists(generated_file_path) else 0

    export_record = Export(
        assignment_id=assignment_id,
        export_type=export_type,
        file_path=generated_file_path,
        file_size_bytes=file_size,
        submission_count=len(evaluated_submissions),
    )
    db.add(export_record)
    await db.commit()
    await db.refresh(export_record)

    return ExportResponse(
        id=export_record.id,
        assignment_id=export_record.assignment_id,
        export_type=export_record.export_type,
        file_path=export_record.file_path,
        file_size_bytes=export_record.file_size_bytes,
        submission_count=export_record.submission_count,
        created_at=export_record.created_at,
        download_url=f"/api/export/downloads/{export_record.id}",
    )


@router.get("/assignments/{assignment_id}/exports", response_model=List[ExportResponse])
async def list_assignment_exports(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Export)
        .where(Export.assignment_id == assignment_id)
        .order_by(Export.created_at.desc())
    )
    res = await db.execute(stmt)
    exports = res.scalars().all()

    return [
        ExportResponse(
            id=e.id,
            assignment_id=e.assignment_id,
            export_type=e.export_type,
            file_path=e.file_path,
            file_size_bytes=e.file_size_bytes,
            submission_count=e.submission_count,
            created_at=e.created_at,
            download_url=f"/api/export/downloads/{e.id}",
        )
        for e in exports
    ]


@router.get("/downloads/{id}")
@router.get("/export/downloads/{id}")
@router.get("/exports/{id}/download")
async def download_export_file(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serves the generated export file with correct filename and headers."""
    stmt = select(Export).where(Export.id == id)
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()
    if not record or not os.path.exists(record.file_path):
        raise HTTPException(status_code=404, detail="Export file not found")

    filename = os.path.basename(record.file_path)
    return FileResponse(
        path=record.file_path,
        filename=filename,
        media_type="application/octet-stream",
    )


@router.get("/single/{submission_id}/pdf")
@router.get("/export/single/{submission_id}/pdf")
@router.get("/exports/single/{submission_id}/pdf")
async def download_single_submission_pdf(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Direct one-click download of an individual student's PDF report."""
    stmt = (
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.assignment),
            selectinload(Submission.evaluation).selectinload(Evaluation.criterion_scores),
        )
        .where(Submission.id == submission_id)
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub or not sub.evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found for this submission")

    ev = sub.evaluation
    assignment = sub.assignment
    s_name = sub.student.name if sub.student else (sub.detected_name or "Unknown")
    clean_s_name = sanitize_filename(s_name)
    clean_title = sanitize_filename(assignment.title)

    export_dir = export_service.get_assignment_export_dir(str(assignment.id))
    pdf_name = f"{clean_s_name}_{clean_title}_evaluation.pdf"
    p_path = os.path.join(export_dir, pdf_name)

    crit_list = [
        {
            "criterion_name": cs.criterion_name,
            "score": cs.score,
            "max_score": cs.max_score,
            "rationale": cs.rationale,
            "evidence": cs.evidence,
        }
        for cs in ev.criterion_scores
    ]

    eval_date = (ev.generated_at or datetime.now()).strftime("%B %d, %Y")
    export_service.generate_pdf_report(
        student_name=s_name,
        assignment_title=assignment.title,
        total_score=ev.total_score,
        max_score=ev.max_score,
        percentage=ev.percentage or 0.0,
        grade_label=ev.grade_label or "",
        criterion_scores=crit_list,
        requirements=ev.requirements_result or [],
        english_analysis=ev.english_analysis or {},
        strengths=ev.strengths or [],
        improvements=ev.improvements or [],
        teacher_feedback=ev.teacher_feedback or "",
        evaluated_date=eval_date,
        output_path=p_path,
    )

    return FileResponse(
        path=p_path,
        filename=pdf_name,
        media_type="application/pdf",
    )


@router.get("/single/{submission_id}/docx")
@router.get("/export/single/{submission_id}/docx")
@router.get("/exports/single/{submission_id}/docx")
async def download_single_submission_docx(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Direct one-click download of an individual student's DOCX report."""
    stmt = (
        select(Submission)
        .options(
            selectinload(Submission.student),
            selectinload(Submission.assignment),
            selectinload(Submission.evaluation).selectinload(Evaluation.criterion_scores),
        )
        .where(Submission.id == submission_id)
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub or not sub.evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found for this submission")

    ev = sub.evaluation
    assignment = sub.assignment
    s_name = sub.student.name if sub.student else (sub.detected_name or "Unknown")
    clean_s_name = sanitize_filename(s_name)
    clean_title = sanitize_filename(assignment.title)

    export_dir = export_service.get_assignment_export_dir(str(assignment.id))
    docx_name = f"{clean_s_name}_{clean_title}_evaluation.docx"
    d_path = os.path.join(export_dir, docx_name)

    crit_list = [
        {
            "criterion_name": cs.criterion_name,
            "score": cs.score,
            "max_score": cs.max_score,
            "rationale": cs.rationale,
            "evidence": cs.evidence,
        }
        for cs in ev.criterion_scores
    ]

    eval_date = (ev.generated_at or datetime.now()).strftime("%B %d, %Y")
    export_service.generate_docx_report(
        student_name=s_name,
        assignment_title=assignment.title,
        total_score=ev.total_score,
        max_score=ev.max_score,
        percentage=ev.percentage or 0.0,
        grade_label=ev.grade_label or "",
        criterion_scores=crit_list,
        requirements=ev.requirements_result or [],
        english_analysis=ev.english_analysis or {},
        strengths=ev.strengths or [],
        improvements=ev.improvements or [],
        teacher_feedback=ev.teacher_feedback or "",
        evaluated_date=eval_date,
        output_path=d_path,
    )

    return FileResponse(
        path=d_path,
        filename=docx_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
