import os
import time
import requests
import json

BASE_URL = "http://localhost:8000/api"

def run_test():
    print("=== Step 1 & 2: Creating Test Assignment ===")
    assignment_payload = {
        "title": "Test Assignment",
        "assignment_type": "Narrative",
        "instructions": "Write about your favourite memory",
        "total_marks": 10.0,
        "feedback_instructions": "Start with one specific strength. Then mention one grammar issue. Keep under 80 words.",
        "rubric_criteria": [
            {
                "name": "Content",
                "max_marks": 5.0,
                "weight": 1.0,
                "description": "Richness of details, imagery, and personal reflection on the memory"
            },
            {
                "name": "Grammar",
                "max_marks": 5.0,
                "weight": 1.0,
                "description": "Grammatical accuracy, sentence structure, punctuation, and mechanics"
            }
        ],
        "requirements": [
            {
                "rule_type": "length",
                "rule_value": "100-200 words",
                "description": "Essay must be between 100 and 200 words",
                "is_strict": True
            }
        ]
    }
    
    res = requests.post(f"{BASE_URL}/assignments", json=assignment_payload)
    if res.status_code != 201:
        print("Failed to create assignment:", res.status_code, res.text)
        return
    assignment = res.json()
    assignment_id = assignment["id"]
    print(f"Assignment created with ID: {assignment_id}")

    print("\n=== Step 3: Preparing Test_Student.txt ===")
    student_text = (
        "My favorite memory was visiting the seaside cottage with my grandparents during the wonderful summer holidays. "
        "Every single morning, the warm golden sunlight poured gently across the quiet sandy beach while white seagulls soared gracefully in the crisp coastal breeze. "
        "We spent many peaceful hours building intricate sandcastles and collecting colorful seashells along the glistening shoreline. "
        "In the afternoons, my grandmother would bake fresh warm cinnamon scones while grandfather taught me how to carve small wooden boats from driftwood. "
        "Although the rolling waves were sometimes too cold for swimming, we splashed happily near the water edge until twilight painted the distant horizon purple. "
        "That magical summer filled my heart with lifelong warmth and happiness."
    )
    word_count = len(student_text.split())
    print(f"Sample text word count: {word_count} words")
    
    test_file_path = "Test_Student.txt"
    with open(test_file_path, "w", encoding="utf-8") as f:
        f.write(student_text)
        
    print("\n=== Step 4: Uploading Test_Student.txt ===")
    with open(test_file_path, "rb") as f:
        files = [("files", ("Test_Student.txt", f, "text/plain"))]
        res = requests.post(f"{BASE_URL}/submissions/{assignment_id}/upload", files=files)
    
    if res.status_code != 200:
        print("Upload failed:", res.status_code, res.text)
        return
        
    submissions = res.json()
    sub = submissions[0]
    print(f"Upload successful. Submissions count: {len(submissions)}")
    print(f"Detected name: {sub.get('detected_name')}")
    print(f"Confidence: {sub.get('name_confidence')}")
    print(f"Name flagged: {sub.get('name_flagged')}")
    print(f"Status: {sub.get('status')}")
    print(f"Word count: {sub.get('word_count')}")
    
    assert sub.get("detected_name") == "Test Student", "Name detection mismatch!"
    assert not sub.get("name_flagged"), "Student name should not be flagged!"

    print("\n=== Step 5: Starting Evaluation ===")
    eval_res = requests.post(f"{BASE_URL}/assignments/{assignment_id}/evaluate")
    print("Evaluate response:", eval_res.status_code, eval_res.json())
    if eval_res.status_code != 200:
        print("Evaluation start failed!")
        return

    print("\n=== Step 6: Polling Progress Screen ===")
    for _ in range(30):
        time.sleep(2)
        prog_res = requests.get(f"{BASE_URL}/assignments/{assignment_id}/progress")
        if prog_res.status_code == 200:
            prog = prog_res.json()
            status = prog.get("status")
            pct = prog.get("progress_percentage")
            completed = prog.get("completed_submissions", 0)
            total = prog.get("total_submissions", 0)
            print(f"Job Status: {status} | Progress: {pct}% | Completed: {completed}/{total}")
            if status == "completed":
                break
            if status in ["failed", "cancelled"]:
                print("Job failed or cancelled:", prog)
                return
        else:
            print("Progress error:", prog_res.status_code, prog_res.text)

    print("\n=== Step 7: Verifying Results ===")
    results_res = requests.get(f"{BASE_URL}/assignments/{assignment_id}/results")
    if results_res.status_code != 200:
        print("Failed to get results:", results_res.status_code, results_res.text)
        return
        
    results_data = results_res.json()
    submissions_results = results_data.get("submissions", [])
    if not submissions_results:
        print("No submissions in results!")
        return
        
    res_entry = submissions_results[0]
    eval_data = res_entry.get("evaluation")
    print(f"Student: {res_entry.get('student_name')}")
    print(f"Total Score: {eval_data.get('total_score')}/{assignment.get('total_marks')}")
    print(f"Criteria Scores:")
    for cs in eval_data.get("criterion_scores", []):
        print(f"  - {cs.get('criterion_name')}: {cs.get('score')}/{cs.get('max_marks')} (Raw: {cs.get('raw_score')}) -> {cs.get('reasoning')}")
    
    feedback = eval_data.get("feedback_text")
    feedback_words = len(feedback.split()) if feedback else 0
    print(f"\nPersonalized Feedback ({feedback_words} words):")
    print("--------------------------------------------------")
    print(feedback)
    print("--------------------------------------------------")
    
    # Clean up test file
    if os.path.exists(test_file_path):
        os.remove(test_file_path)

if __name__ == "__main__":
    run_test()
