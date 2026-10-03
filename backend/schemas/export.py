"""Pydantic Schemas — Export"""

from datetime import datetime
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict


class ExportRequest(BaseModel):
    export_type: str  # individual_pdf, individual_docx, bulk_zip_pdf, bulk_zip_docx, excel_summary, csv_summary
    submission_ids: Optional[List[uuid.UUID]] = None  # None means all applicable submissions


class ExportResponse(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    export_type: str
    file_path: str
    file_size_bytes: Optional[int] = None
    submission_count: Optional[int] = None
    created_at: datetime
    download_url: str

    model_config = ConfigDict(from_attributes=True)
