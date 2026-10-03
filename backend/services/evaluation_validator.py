"""
GradeWise — Evaluation Validator Service
Validates AI evaluation response schema, score totals, ranges, and feedback quality.
"""

from typing import Any, Dict, List, Optional, Tuple


def count_words(text: str) -> int:
    if not text:
        return 0
    return len(text.split())


def validate_evaluation_json(
    data: Dict[str, Any],
    expected_total_marks: int,
    rubric_criteria: List[Dict[str, Any]],
    requirements: List[Dict[str, Any]],
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validates evaluation JSON data.
    Returns (is_valid, error_message, sanitized_data).
    """
    # 1. Required top-level fields
    required_fields = [
        "total_score",
        "max_score",
        "percentage",
        "criterion_scores",
        "requirements",
        "english_analysis",
        "strengths",
        "improvements",
        "teacher_feedback",
    ]
    for rf in required_fields:
        if rf not in data:
            return False, f"Missing required field in evaluation response: '{rf}'", None

    # 2. Check total_score & max_score types
    try:
        total_score = int(data["total_score"])
        max_score = int(data["max_score"])
    except (ValueError, TypeError):
        return False, "total_score and max_score must be integers.", None

    if max_score != expected_total_marks:
        # Auto-correct max_score if it drifted from assignment total_marks
        max_score = expected_total_marks
        data["max_score"] = expected_total_marks

    # 3. Validate criterion_scores
    criterion_scores = data.get("criterion_scores")
    if not isinstance(criterion_scores, list) or len(criterion_scores) == 0:
        return False, "criterion_scores must be a non-empty list.", None

    # Map expected criteria by lowercase name for robust matching
    crit_map = {c["name"].strip().lower(): c for c in rubric_criteria}

    calculated_total = 0
    validated_criterion_scores = []

    for cs in criterion_scores:
        if not isinstance(cs, dict):
            return False, "Each criterion score must be an object.", None
        c_name = cs.get("criterion_name", "").strip()
        matched_crit = crit_map.get(c_name.lower())

        if not matched_crit:
            # Try fuzzy match if only 1 criterion exists or prefix match
            for exp_name, exp_obj in crit_map.items():
                if exp_name in c_name.lower() or c_name.lower() in exp_name:
                    matched_crit = exp_obj
                    break

        if not matched_crit:
            return False, f"Criterion '{c_name}' does not match any assignment rubric criterion.", None

        try:
            score = int(cs.get("score", 0))
            crit_max = int(matched_crit["max_marks"])
        except (ValueError, TypeError):
            return False, f"Score for '{c_name}' must be an integer.", None

        if score < 0 or score > crit_max:
            return False, f"Criterion '{c_name}' score {score} is out of bounds (must be 0-{crit_max}).", None

        calculated_total += score
        validated_criterion_scores.append({
            "criterion_id": matched_crit["id"],
            "criterion_name": matched_crit["name"],
            "score": score,
            "max_score": crit_max,
            "rationale": str(cs.get("rationale", "")).strip(),
            "evidence": str(cs.get("evidence", "")).strip(),
        })

    # Ensure all assignment criteria were scored
    scored_crit_ids = {v["criterion_id"] for v in validated_criterion_scores}
    for c in rubric_criteria:
        if c["id"] not in scored_crit_ids:
            return False, f"Missing score for rubric criterion: '{c['name']}'", None

    # 4. Verify sum(criterion_scores[].score) == total_score
    if calculated_total != total_score:
        return (
            False,
            f"Criterion scores sum ({calculated_total}) does not match total_score ({total_score}).",
            None,
        )

    # 5. Validate teacher_feedback
    teacher_feedback = str(data.get("teacher_feedback", "")).strip()
    feedback_word_count = count_words(teacher_feedback)
    if feedback_word_count < 25:
        return (
            False,
            f"teacher_feedback is too short ({feedback_word_count} words; minimum 25 words required).",
            None,
        )

    # Calculate percentage
    percentage = calculate_percentage(total_score, max_score)

    # Validate english_analysis categories
    eng = data.get("english_analysis", {})
    categories = ["grammar", "vocabulary", "tenses", "mechanics", "structure"]
    sanitized_eng = {}
    for cat in categories:
        cat_data = eng.get(cat, {}) if isinstance(eng, dict) else {}
        sanitized_eng[cat] = {
            "summary": str(cat_data.get("summary", "No major issues identified.")),
            "issues": [str(i) for i in cat_data.get("issues", [])] if isinstance(cat_data.get("issues"), list) else [],
            "severity": str(cat_data.get("severity", "none")).lower() if str(cat_data.get("severity", "none")).lower() in ["none", "minor", "moderate", "significant"] else "none"
        }

    # Validate requirements
    reqs_input = data.get("requirements", [])
    sanitized_reqs = []
    if isinstance(reqs_input, list):
        for r in reqs_input:
            if isinstance(r, dict):
                sanitized_reqs.append({
                    "description": str(r.get("description", "")),
                    "status": str(r.get("status", "PARTIAL")).upper(),
                    "detail": str(r.get("detail", "")),
                })

    sanitized_data = {
        "total_score": total_score,
        "max_score": max_score,
        "percentage": percentage,
        "criterion_scores": validated_criterion_scores,
        "requirements": sanitized_reqs,
        "english_analysis": sanitized_eng,
        "strengths": [str(s) for s in data.get("strengths", []) if s],
        "improvements": [str(i) for i in data.get("improvements", []) if i],
        "teacher_feedback": teacher_feedback,
    }

    return True, None, sanitized_data


def validate_scores(criterion_scores: List[Dict[str, Any]], total_score: int) -> Tuple[bool, Optional[str]]:
    """Validates that the sum of criterion scores equals total_score."""
    if not isinstance(criterion_scores, list):
        return False, "criterion_scores must be a list."
    try:
        sum_scores = sum(int(cs.get("score", 0)) for cs in criterion_scores if isinstance(cs, dict))
    except (ValueError, TypeError) as e:
        return False, f"Invalid score value in criterion_scores: {str(e)}"

    if sum_scores != total_score:
        return False, f"Sum of criterion scores ({sum_scores}) does not equal total_score ({total_score})."
    return True, None


def validate_response_schema(response_dict: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """Checks that all required fields are present in the response dictionary."""
    if not isinstance(response_dict, dict):
        return False, "Response must be a JSON object."
    required_fields = [
        "total_score",
        "max_score",
        "percentage",
        "criterion_scores",
        "requirements",
        "english_analysis",
        "strengths",
        "improvements",
        "teacher_feedback",
    ]
    missing = [f for f in required_fields if f not in response_dict]
    if missing:
        return False, f"Missing required fields: {', '.join(missing)}"
    return True, None


def calculate_percentage(score: float, max_score: float) -> float:
    """Calculates percentage rounded to 1 decimal place."""
    if not max_score or max_score <= 0:
        return 0.0
    return round((float(score) / float(max_score)) * 100.0, 1)


def calculate_grade(percentage: float, grade_scale: Optional[List[Dict[str, Any]]] = None) -> str:
    """Calculates letter grade from percentage and grade scale."""
    default_scale = [
        {"min_pct": 90, "label": "A"},
        {"min_pct": 80, "label": "B"},
        {"min_pct": 70, "label": "C"},
        {"min_pct": 60, "label": "D"},
        {"min_pct": 0, "label": "F"},
    ]
    scale = grade_scale or default_scale
    sorted_scale = sorted(scale, key=lambda x: x.get("min_pct", 0), reverse=True)
    for entry in sorted_scale:
        if percentage >= entry.get("min_pct", 0):
            return entry.get("label", "F")
    return "F"

