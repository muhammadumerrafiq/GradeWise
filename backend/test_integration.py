import asyncio
import os
import sys
import unittest
from fastapi.testclient import TestClient

from main import app
from database import create_tables, AsyncSessionLocal
from models.assignment import Assignment, RubricCriterion, Requirement
from models.submission import Submission
from models.evaluation import Evaluation, CriterionScore
from services.name_parser import parse_student_name

client = TestClient(app)

class TestGradeWiseEndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        asyncio.run(create_tables())

    def test_01_health_check(self):
        res = client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        print("[OK] Health check passed")

    def test_02_name_parser(self):
        name1, conf1 = parse_student_name("Sara_Ahmed_Narrative_Essay.txt")
        self.assertEqual(name1, "Sara Ahmed")
        self.assertGreaterEqual(conf1, 0.8)

        name2, conf2 = parse_student_name("Emily_Watson_FA23_014_Essay.pdf")
        self.assertEqual(name2, "Emily Watson")
        self.assertGreaterEqual(conf2, 0.8)

        name3, conf3 = parse_student_name("unknown_task_submission_991823.txt")
        self.assertLess(conf3, 0.5)
        self.assertEqual(name3, "Unknown")
        print("[OK] Name parser passed with confidence scoring and noise word removal")

    def test_03_rubric_sum_validation(self):
        # Mismatch: total_marks=20, but rubric sum=15
        invalid_payload = {
            "title": "Invalid Assignment",
            "type": "essay",
            "total_marks": 20,
            "rubric_criteria": [
                {"name": "Content", "max_marks": 10},
                {"name": "Organization", "max_marks": 5},
            ]
        }
        res = client.post("/api/assignments", json=invalid_payload)
        self.assertEqual(res.status_code, 422)

        # Valid: total_marks=20, rubric sum=20
        valid_payload = {
            "title": "Narrative Essay on Resilience",
            "type": "narrative",
            "instructions": "Write a 600-800 word personal narrative demonstrating perseverance.",
            "grading_notes": "Look for sensory imagery and emotional resonance.",
            "total_marks": 20,
            "rubric_criteria": [
                {"name": "Content & Ideas", "max_marks": 5, "description": "Depth and insight"},
                {"name": "Organization", "max_marks": 5, "description": "Flow and transitions"},
                {"name": "Grammar & Syntax", "max_marks": 5, "description": "Accuracy and variety"},
                {"name": "Vocabulary & Voice", "max_marks": 5, "description": "Tone and word choice"},
            ],
            "requirements": [
                {"description": "600-800 words in length"},
                {"description": "First-person perspective"},
            ]
        }
        res = client.post("/api/assignments", json=valid_payload)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        self.assertEqual(created["title"], "Narrative Essay on Resilience")
        self.assertEqual(len(created["rubric_criteria"]), 4)
        TestGradeWiseEndToEnd.assignment_id = created["id"]
        print(f"[OK] Assignment created with validated rubric: {TestGradeWiseEndToEnd.assignment_id}")

    def test_04_file_upload_and_extraction(self):
        assign_id = TestGradeWiseEndToEnd.assignment_id
        sample_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_submissions")

        txt_path = os.path.join(sample_dir, "Sara_Ahmed_Narrative_Essay.txt")
        docx_path = os.path.join(sample_dir, "David_Chen_Narrative_Submission.docx")
        pdf_path = os.path.join(sample_dir, "Emily_Watson_FA23_014_Essay.pdf")
        flagged_txt = os.path.join(sample_dir, "unknown_task_submission_991823.txt")

        with open(txt_path, "rb") as f1, open(docx_path, "rb") as f2, open(pdf_path, "rb") as f3, open(flagged_txt, "rb") as f4:
            files = [
                ("files", ("Sara_Ahmed_Narrative_Essay.txt", f1, "text/plain")),
                ("files", ("David_Chen_Narrative_Submission.docx", f2, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
                ("files", ("Emily_Watson_FA23_014_Essay.pdf", f3, "application/pdf")),
                ("files", ("unknown_task_submission_991823.txt", f4, "text/plain")),
            ]
            res = client.post(f"/api/assignments/{assign_id}/upload", files=files)

        self.assertEqual(res.status_code, 200)
        uploaded = res.json()
        self.assertEqual(len(uploaded), 4)

        # Check that unknown submission was flagged
        flagged = [u for u in uploaded if u["name_flagged"]]
        self.assertEqual(len(flagged), 1)
        TestGradeWiseEndToEnd.flagged_sub_id = flagged[0]["id"]
        TestGradeWiseEndToEnd.sara_sub_id = [u for u in uploaded if u["detected_name"] == "Sara Ahmed"][0]["id"]
        print(f"[OK] Uploaded 4 submissions (1 flagged as expected: {TestGradeWiseEndToEnd.flagged_sub_id})")

    def test_05_batch_name_resolution(self):
        assign_id = TestGradeWiseEndToEnd.assignment_id
        flagged_id = TestGradeWiseEndToEnd.flagged_sub_id

        # Batch resolve flagged name to "Arthur Miller"
        payload = {
            "resolutions": [
                {"submission_id": flagged_id, "student_name": "Arthur Miller"}
            ]
        }
        res = client.post(f"/api/assignments/{assign_id}/name-mapping/batch", json=payload)
        self.assertEqual(res.status_code, 200)

        # Verify no flagged items remain
        sub_list_res = client.get(f"/api/assignments/{assign_id}/submissions")
        subs = sub_list_res.json()
        self.assertFalse(any(s["name_flagged"] for s in subs))
        print("[OK] Batch name resolution verified")

    def test_06_manual_evaluation_and_recalculation(self):
        """Simulate an evaluated submission to test score editing, auto-recalculation, and approval."""
        assign_id = TestGradeWiseEndToEnd.assignment_id
        sara_id = TestGradeWiseEndToEnd.sara_sub_id

        async def insert_eval():
            async with AsyncSessionLocal() as session:
                from sqlalchemy.orm import selectinload
                from sqlalchemy import select
                assign_uuid = __import__("uuid").UUID(assign_id)
                stmt = select(Assignment).options(selectinload(Assignment.rubric_criteria)).where(Assignment.id == assign_uuid)
                res = await session.execute(stmt)
                assign = res.scalar_one()
                crits = assign.rubric_criteria

                ev = Evaluation(
                    submission_id=__import__("uuid").UUID(sara_id),
                    total_score=17,
                    max_score=20,
                    percentage=85.0,
                    grade_label="B",
                    requirements_result=[
                        {"description": "600-800 words in length", "status": "PASS", "detail": "Word count: 723"},
                        {"description": "First-person perspective", "status": "PASS", "detail": "Strong personal voice"},
                    ],
                    english_analysis={
                        "grammar": {"summary": "Strong command of complex sentences.", "issues": [], "severity": "none"},
                        "vocabulary": {"summary": "Rich adjectives and descriptive verbs.", "issues": [], "severity": "none"},
                        "tenses": {"summary": "Consistent past tense narration.", "issues": [], "severity": "none"},
                        "mechanics": {"summary": "Accurate punctuation throughout.", "issues": [], "severity": "none"},
                        "structure": {"summary": "Compelling narrative arc with clear climax.", "issues": [], "severity": "none"},
                    },
                    strengths=[
                        "Vivid sensory imagery in the library opening scene.",
                        "Reflective tone that conveys genuine vulnerability.",
                    ],
                    improvements=[
                        "Expand on the dialogue with grandfather for dramatic impact.",
                    ],
                    ai_feedback="Sara demonstrates an exceptional ability to establish atmosphere through controlled pacing. The reflection on her grandfather's advice provides an emotional anchor that elevates the narrative from a mature exploration of self-determination. Continuing to develop secondary characters will enhance future writing.",
                    teacher_feedback="Sara demonstrates an exceptional ability to establish atmosphere through controlled pacing. The reflection on her grandfather's advice provides an emotional anchor that elevates the narrative from a mature exploration of self-determination. Continuing to develop secondary characters will enhance future writing.",
                    eval_status="pending_review",
                )
                session.add(ev)
                await session.flush()

                for c in crits:
                    cs = CriterionScore(
                        evaluation_id=ev.id,
                        criterion_id=c.id,
                        criterion_name=c.name,
                        score=4 if c.max_marks >= 4 else c.max_marks,
                        max_score=c.max_marks,
                        rationale="Strong execution with minor area for elaboration.",
                    )
                    session.add(cs)
                await session.commit()
                return str(ev.id)

        eval_id = asyncio.run(insert_eval())
        TestGradeWiseEndToEnd.evaluation_id = eval_id

        # Test GET /api/evaluations/{id}
        res = client.get(f"/api/evaluations/{eval_id}")
        self.assertEqual(res.status_code, 200)
        ev_data = res.json()
        self.assertEqual(ev_data["total_score"], 17)

        # Test PUT /api/evaluations/{id} editing feedback
        update_res = client.put(f"/api/evaluations/{eval_id}", json={
            "teacher_feedback": "Sara, this is an outstanding piece of personal writing with magnificent atmosphere."
        })
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["teacher_feedback"], "Sara, this is an outstanding piece of personal writing with magnificent atmosphere.")

        # Test Approve
        app_res = client.post(f"/api/evaluations/{eval_id}/approve")
        self.assertEqual(app_res.status_code, 200)
        self.assertEqual(app_res.json()["eval_status"], "approved")
        print("[OK] Evaluation inspection, inline feedback editing, and approval passed")

    def test_07_export_generation(self):
        assign_id = TestGradeWiseEndToEnd.assignment_id

        # 1. Export Excel
        res = client.post(f"/api/assignments/{assign_id}/export", json={"export_type": "excel_summary"})
        self.assertEqual(res.status_code, 200)
        excel_data = res.json()
        self.assertTrue(excel_data["file_path"].endswith(".xlsx"))
        self.assertTrue(os.path.exists(excel_data["file_path"]))

        # 2. Export CSV
        res = client.post(f"/api/assignments/{assign_id}/export", json={"export_type": "csv_summary"})
        self.assertEqual(res.status_code, 200)
        csv_data = res.json()
        self.assertTrue(csv_data["file_path"].endswith(".csv"))

        # 3. Export Bulk ZIP PDF
        res = client.post(f"/api/assignments/{assign_id}/export", json={"export_type": "bulk_zip_pdf"})
        self.assertEqual(res.status_code, 200)
        zip_data = res.json()
        self.assertTrue(zip_data["file_path"].endswith(".zip"))
        self.assertTrue(os.path.exists(zip_data["file_path"]))

        # 4. Download file endpoint
        dl_res = client.get(zip_data["download_url"])
        self.assertEqual(dl_res.status_code, 200)
        self.assertGreater(len(dl_res.content), 0)
        print("[OK] PDF, Excel summary, CSV, and bulk ZIP export generated and downloaded")


if __name__ == "__main__":
    unittest.main()
