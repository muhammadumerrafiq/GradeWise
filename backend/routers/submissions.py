"""
GradeWise — Submissions Router
Handles file uploads, text extraction, name parsing, name mapping, and file serving.
"""

import csv
import hashlib
import io
import os
import shutil
import uuid
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, File, HTTPException, UploadFile, status
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from database import get_db
from models.assignment import Assignment
from models.student import Student
from models.submission import Submission
from schemas.submission import (
    BatchNameResolutionRequest,
    SubmissionResponse,
    SubmissionUpdateStudent,
)
from services.file_extractor import count_words, extract_text, extract_zip
from services.name_parser import parse_student_name

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".zip", ".csv"}


def compute_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


@router.post("/{assignment_id}/upload", response_model=List[SubmissionResponse])
async def upload_submissions(
    assignment_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Accepts multipart file upload (multiple documents or a single ZIP).
    Validates file sizes and extensions.
    Extracts text, counts words, parses student names, and creates Submission records.
    """
    res = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assign_upload_dir = os.path.join(settings.UPLOAD_DIR, str(assignment_id))
    os.makedirs(assign_upload_dir, exist_ok=True)

    created_submissions = []

    for upload_file in files:
        original_name = upload_file.filename or "unknown_file"
        _, ext = os.path.splitext(original_name)
        ext = ext.lower()

        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Only PDF, DOCX, DOC, and TXT files are accepted. [{original_name}] was not uploaded.",
            )

        content = await upload_file.read()
        file_size_mb = len(content) / (1024 * 1024)

        if ext == ".zip":
            if file_size_mb > settings.MAX_ZIP_SIZE_MB:
                raise HTTPException(
                    status_code=400,
                    detail=f"ZIP exceeds {settings.MAX_ZIP_SIZE_MB}MB limit.",
                )

            temp_zip_path = os.path.join(assign_upload_dir, f"temp_{uuid.uuid4().hex}.zip")
            with open(temp_zip_path, "wb") as f:
                f.write(content)

            extracted_paths = extract_zip(temp_zip_path, assign_upload_dir)
            if os.path.exists(temp_zip_path):
                os.remove(temp_zip_path)

            if not extracted_paths:
                raise HTTPException(
                    status_code=400,
                    detail="No valid submissions found in this ZIP.",
                )

            for e_path in extracted_paths:
                base_name = os.path.basename(e_path)
                with open(e_path, "rb") as ef:
                    e_content = ef.read()

                sub = await _process_single_file(
                    db=db,
                    assignment_id=assignment_id,
                    original_name=base_name,
                    file_content=e_content,
                    assign_upload_dir=assign_upload_dir,
                    existing_path=e_path,
                )
                if sub:
                    created_submissions.append(sub)

        elif ext == ".csv":
            if file_size_mb > 50:
                raise HTTPException(
                    status_code=400,
                    detail="CSV file exceeds 50MB limit.",
                )

            csv_text = content.decode("utf-8-sig", errors="replace")
            reader = csv.reader(io.StringIO(csv_text))
            rows = list(reader)
            if not rows or len(rows) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="CSV file must contain a header row and at least one student submission row.",
                )

            headers = [h.strip().lower() for h in rows[0]]
            name_idx = -1
            text_idx = -1

            # Detect name column
            for i, h in enumerate(headers):
                if any(k in h for k in ["name", "student", "author"]):
                    name_idx = i
                    break
            if name_idx == -1:
                name_idx = 0

            # Detect submission text column
            for i, h in enumerate(headers):
                if i != name_idx and any(k in h for k in ["submi", "text", "essay", "content", "work", "body", "assign"]):
                    text_idx = i
                    break
            if text_idx == -1:
                text_idx = 1 if len(headers) > 1 else 0

            for row_num, row in enumerate(rows[1:], start=2):
                if not row or not any(cell.strip() for cell in row):
                    continue
                s_name = row[name_idx].strip() if name_idx < len(row) else f"Student {row_num - 1}"
                s_text = row[text_idx].strip() if text_idx < len(row) else ""
                if not s_text:
                    continue

                sub = await _process_csv_submission(
                    db=db,
                    assignment_id=assignment_id,
                    student_name=s_name,
                    submission_text=s_text,
                    assign_upload_dir=assign_upload_dir,
                    row_index=row_num,
                )
                if sub:
                    created_submissions.append(sub)

        else:
            if file_size_mb > settings.MAX_UPLOAD_SIZE_MB:
                raise HTTPException(
                    status_code=400,
                    detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit. Please compress or split.",
                )

            sub = await _process_single_file(
                db=db,
                assignment_id=assignment_id,
                original_name=original_name,
                file_content=content,
                assign_upload_dir=assign_upload_dir,
            )
            if sub:
                created_submissions.append(sub)

    await db.commit()

    # Re-query all created submissions with student loaded
    sub_ids = [s.id for s in created_submissions]
    result_stmt = (
        select(Submission)
        .options(selectinload(Submission.student))
        .where(Submission.id.in_(sub_ids))
    )
    res = await db.execute(result_stmt)
    return res.scalars().all()


async def _process_single_file(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    original_name: str,
    file_content: bytes,
    assign_upload_dir: str,
    existing_path: Optional[str] = None,
) -> Optional[Submission]:
    """Helper to process, extract, and record a single submission file."""
    f_hash = compute_file_hash(file_content)

    # Duplicate check within this assignment
    dup_stmt = select(Submission).where(
        Submission.assignment_id == assignment_id,
        Submission.file_hash == f_hash,
    )
    dup_res = await db.execute(dup_stmt)
    existing_sub = dup_res.scalars().first()
    if existing_sub:
        # Skip duplicate
        return None

    _, ext = os.path.splitext(original_name)
    ext = ext.lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    final_path = os.path.join(assign_upload_dir, stored_name)

    if existing_path and os.path.exists(existing_path):
        os.rename(existing_path, final_path)
    else:
        with open(final_path, "wb") as f:
            f.write(file_content)

    # Text extraction
    extracted_text = extract_text(final_path, ext)
    wc = count_words(extracted_text)

    # Name detection
    detected_name, confidence = parse_student_name(original_name)
    name_flagged = confidence < 0.5

    # Determine status & errors
    sub_status = "pending"
    error_msg = None

    if not extracted_text.strip():
        sub_status = "extraction_failed"
        error_msg = "Could not extract text. File may be scanned or empty."
    elif wc < 50:
        sub_status = "review_needed"
        error_msg = f"Submission appears too short ({wc} words). Please verify."
    elif name_flagged:
        sub_status = "name_pending"

    # Create Student record or match existing
    student_id = None
    if detected_name != "Unknown":
        s_stmt = select(Student).where(Student.name == detected_name)
        s_res = await db.execute(s_stmt)
        existing_student = s_res.scalars().first()
        if existing_student:
            student_id = existing_student.id
        else:
            new_student = Student(name=detected_name)
            db.add(new_student)
            await db.flush()
            student_id = new_student.id

    submission = Submission(
        assignment_id=assignment_id,
        student_id=student_id,
        original_filename=original_name,
        stored_filename=stored_name,
        stored_path=final_path,
        file_type=ext.lstrip("."),
        file_size_bytes=len(file_content),
        file_hash=f_hash,
        extracted_text=extracted_text,
        word_count=wc,
        detected_name=detected_name,
        name_confidence=confidence,
        name_flagged=name_flagged,
        status=sub_status,
        error_message=error_msg,
    )
    db.add(submission)
    await db.flush()
    return submission


async def _process_csv_submission(
    db: AsyncSession,
    assignment_id: uuid.UUID,
    student_name: str,
    submission_text: str,
    assign_upload_dir: str,
    row_index: int,
) -> Optional[Submission]:
    """Helper to process and record a submission from a CSV row."""
    text_bytes = submission_text.encode("utf-8")
    f_hash = compute_file_hash(text_bytes)

    # Duplicate check within this assignment
    dup_stmt = select(Submission).where(
        Submission.assignment_id == assignment_id,
        Submission.file_hash == f_hash,
    )
    dup_res = await db.execute(dup_stmt)
    if dup_res.scalars().first():
        return None

    stored_name = f"row_{row_index}_{uuid.uuid4().hex[:8]}.txt"
    final_path = os.path.join(assign_upload_dir, stored_name)
    with open(final_path, "w", encoding="utf-8") as f:
        f.write(submission_text)

    wc = count_words(submission_text)

    clean_name = student_name.strip()
    if not clean_name or clean_name.lower() in ("unknown", "n/a", "none"):
        detected_name = f"Row {row_index} Student"
        confidence = 0.2
        name_flagged = True
    elif len(clean_name) < 2 or not any(c.isalpha() for c in clean_name):
        detected_name = clean_name
        confidence = 0.4
        name_flagged = True
    else:
        detected_name = clean_name
        confidence = 1.0
        name_flagged = False

    sub_status = "pending"
    error_msg = None
    if wc < 50:
        sub_status = "review_needed"
        error_msg = f"Submission appears too short ({wc} words). Please verify."
    elif name_flagged:
        sub_status = "name_pending"

    student_id = None
    if detected_name and not name_flagged:
        s_stmt = select(Student).where(Student.name == detected_name)
        s_res = await db.execute(s_stmt)
        existing_student = s_res.scalars().first()
        if existing_student:
            student_id = existing_student.id
        else:
            new_student = Student(name=detected_name)
            db.add(new_student)
            await db.flush()
            student_id = new_student.id

    submission = Submission(
        assignment_id=assignment_id,
        student_id=student_id,
        original_filename=f"CSV Row {row_index} ({clean_name or 'Unnamed'})",
        stored_filename=stored_name,
        stored_path=final_path,
        file_type="csv",
        file_size_bytes=len(text_bytes),
        file_hash=f_hash,
        extracted_text=submission_text,
        word_count=wc,
        detected_name=detected_name,
        name_confidence=confidence,
        name_flagged=name_flagged,
        status=sub_status,
        error_message=error_msg,
    )
    db.add(submission)
    await db.flush()
    return submission


@router.get("/{assignment_id}/submissions", response_model=List[SubmissionResponse])
async def list_assignment_submissions(
    assignment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Submission)
        .options(selectinload(Submission.student))
        .where(Submission.assignment_id == assignment_id)
        .order_by(Submission.uploaded_at.asc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()


@router.put("/{id}/student", response_model=SubmissionResponse)
async def update_submission_student(
    id: uuid.UUID,
    payload: SubmissionUpdateStudent,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Submission)
        .options(selectinload(Submission.student))
        .where(Submission.id == id)
    )
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    clean_name = payload.student_name.strip()
    s_stmt = select(Student).where(Student.name == clean_name)
    s_res = await db.execute(s_stmt)
    student = s_res.scalars().first()
    if not student:
        student = Student(name=clean_name, section=payload.section)
        db.add(student)
        await db.flush()

    sub.student_id = student.id
    sub.detected_name = clean_name
    sub.name_confidence = 1.0
    sub.name_flagged = False
    if sub.status == "name_pending":
        sub.status = "pending"

    await db.commit()
    await db.refresh(sub)
    return sub


@router.post("/{assignment_id}/name-mapping/batch")
async def batch_resolve_names(
    assignment_id: uuid.UUID,
    payload: BatchNameResolutionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Batch updates student names for flagged submissions and marks them resolved."""
    for item in payload.resolutions:
        stmt = select(Submission).where(Submission.id == item.submission_id)
        res = await db.execute(stmt)
        sub = res.scalar_one_or_none()
        if sub and item.student_name.strip():
            clean_name = item.student_name.strip()
            s_stmt = select(Student).where(Student.name == clean_name)
            s_res = await db.execute(s_stmt)
            student = s_res.scalars().first()
            if not student:
                student = Student(name=clean_name)
                db.add(student)
                await db.flush()

            sub.student_id = student.id
            sub.detected_name = clean_name
            sub.name_confidence = 1.0
            sub.name_flagged = False
            if sub.status == "name_pending":
                sub.status = "pending"

    await db.commit()
    return {"status": "ok", "updated_count": len(payload.resolutions)}


@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_submission(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Submission).where(Submission.id == id)
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if os.path.exists(sub.stored_path):
        try:
            os.remove(sub.stored_path)
        except OSError:
            pass

    await db.delete(sub)
    await db.commit()
    return {"status": "deleted", "submission_id": str(id)}


@router.get("/{id}/file")
async def serve_submission_file(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Submission).where(Submission.id == id)
    res = await db.execute(stmt)
    sub = res.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    if not os.path.exists(sub.stored_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=sub.stored_path,
        filename=sub.original_filename,
        media_type="application/octet-stream",
    )
