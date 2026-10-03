"""
GradeWise — Files Router
Direct endpoint for retrieving original student submission files.
"""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.submission import Submission

router = APIRouter()


@router.get("/submissions/{id}/file")
async def serve_submission_file(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serves the original file stored for a student submission."""
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
