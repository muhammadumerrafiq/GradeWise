"""
GradeWise — Progress Tracker Service
Maintains in-memory progress for batch evaluation jobs.
"""

import time
from typing import Any, Dict, List, Optional
import uuid


class ProgressTracker:
    def __init__(self):
        # assignment_id (str) -> progress dict
        self._jobs: Dict[str, Dict[str, Any]] = {}

    def init_job(self, assignment_id: str, submission_names: List[str]):
        total = len(submission_names)
        self._jobs[str(assignment_id)] = {
            "assignment_id": str(assignment_id),
            "status": "running",
            "total_count": total,
            "completed_count": 0,
            "failed_count": 0,
            "current_name": submission_names[0] if submission_names else None,
            "completed_list": [],
            "queued_names": list(submission_names),
            "errors": [],
            "start_time": time.time(),
            "last_updated": time.time(),
            "cancel_requested": False,
            "pause_requested": False,
        }

    def get_progress(self, assignment_id: str) -> Optional[Dict[str, Any]]:
        job = self._jobs.get(str(assignment_id))
        if not job:
            return None

        # Compute estimated time remaining
        elapsed = time.time() - job["start_time"]
        done = job["completed_count"] + job["failed_count"]
        rem = job["total_count"] - done
        est_seconds = 0
        if done > 0 and rem > 0:
            avg_per_item = elapsed / done
            est_seconds = int(avg_per_item * rem)

        return {
            "assignment_id": job["assignment_id"],
            "status": job["status"],
            "total_count": job["total_count"],
            "completed_count": job["completed_count"],
            "failed_count": job["failed_count"],
            "current_name": job["current_name"],
            "completed_list": job["completed_list"],
            "queued_names": job["queued_names"],
            "errors": job["errors"],
            "estimated_seconds_remaining": est_seconds,
        }

    def start_submission(self, assignment_id: str, name: str):
        job = self._jobs.get(str(assignment_id))
        if job:
            job["current_name"] = name
            if name in job["queued_names"]:
                job["queued_names"].remove(name)
            job["last_updated"] = time.time()

    def complete_submission(
        self, assignment_id: str, name: str, score: Optional[int] = None, max_score: Optional[int] = None
    ):
        job = self._jobs.get(str(assignment_id))
        if job:
            job["completed_count"] += 1
            job["completed_list"].append({"name": name, "score": score, "max_score": max_score})
            job["last_updated"] = time.time()
            self._check_finished(job)

    def fail_submission(self, assignment_id: str, name: str, submission_id: str, error_msg: str):
        job = self._jobs.get(str(assignment_id))
        if job:
            job["failed_count"] += 1
            job["errors"].append({
                "name": name,
                "submission_id": str(submission_id),
                "error": error_msg,
            })
            job["last_updated"] = time.time()
            self._check_finished(job)

    def pause_job(self, assignment_id: str):
        job = self._jobs.get(str(assignment_id))
        if job:
            job["pause_requested"] = True
            job["status"] = "paused"

    def resume_job(self, assignment_id: str):
        job = self._jobs.get(str(assignment_id))
        if job:
            job["pause_requested"] = False
            job["status"] = "running"

    def cancel_job(self, assignment_id: str):
        job = self._jobs.get(str(assignment_id))
        if job:
            job["cancel_requested"] = True
            job["status"] = "cancelled"

    def is_cancelled(self, assignment_id: str) -> bool:
        job = self._jobs.get(str(assignment_id))
        return bool(job and job.get("cancel_requested"))

    def is_paused(self, assignment_id: str) -> bool:
        job = self._jobs.get(str(assignment_id))
        return bool(job and job.get("pause_requested"))

    def _check_finished(self, job: Dict[str, Any]):
        done = job["completed_count"] + job["failed_count"]
        if done >= job["total_count"]:
            job["status"] = "completed"
            job["current_name"] = None


tracker = ProgressTracker()
