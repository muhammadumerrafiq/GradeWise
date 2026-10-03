"""
GradeWise — Gemini AI Integration Service
Handles evaluation requests, prompt assembly, API retry logic, and validation.
"""

import asyncio
import json
import re
import os
from typing import Any, Dict, List, Optional, Tuple
import google.generativeai as genai
import structlog

from config import settings
from services.evaluation_validator import validate_evaluation_json

log = structlog.get_logger()

if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
    os.environ["GOOGLE_API_KEY"] = settings.GEMINI_API_KEY
    os.environ["GEMINI_API_KEY"] = settings.GEMINI_API_KEY
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
    except Exception as _e:
        log.warning("genai module configure warning", error=str(_e))

SYSTEM_PROMPT = """You are a professional English teacher and writing evaluator with 15 years of classroom experience. Your task is to evaluate a student's written assignment thoroughly and fairly.

RULES YOU MUST FOLLOW:
1. Score each rubric criterion as an INTEGER. Minimum 0. Maximum = its specified maximum. Do not give scores outside this range.
2. The sum of ALL criterion scores MUST equal the total_score you provide. Verify this mathematically before responding.
3. The teacher has provided specific instructions for how to write feedback. You MUST follow these instructions exactly in structure, tone, and content when writing the teacher_feedback field. Do not deviate from the teacher's feedback format.
4. Write feedback that references the student's ACTUAL writing — quote or specifically refer to what they wrote.
5. NEVER use these phrases: "good effort", "well done", "keep practicing", "improve your grammar", "overall this is a good attempt", "you need to work on", "with practice you will improve", "this shows potential", "keep up the good work".
6. Vary your sentence structure. Sound like a real teacher who read this specific student's work.
7. Be constructive, honest, and professional. Identify genuine strengths and genuine weaknesses.
8. Feedback tone: natural, direct, appropriate for a teacher addressing a student. Not overly academic. Not overly casual.
9. Respond ONLY with valid JSON matching the provided schema. No preamble, no markdown, no explanation outside the JSON."""

JSON_SCHEMA_EXAMPLE = """{
  "total_score": <integer, sum of criterion scores>,
  "max_score": <integer, equals assignment total_marks>,
  "percentage": <float, total_score / max_score * 100, 1 decimal>,
  "criterion_scores": [
    {
      "criterion_name": "<string, exactly as given>",
      "score": <integer>,
      "max_score": <integer>,
      "rationale": "<string, 1-3 sentences explaining the score>",
      "evidence": "<string, specific quote or reference from submission>"
    }
  ],
  "requirements": [
    {
      "description": "<string, exactly as given>",
      "status": "<PASS|FAIL|PARTIAL>",
      "detail": "<string, specific supporting detail>"
    }
  ],
  "english_analysis": {
    "grammar": {
      "summary": "<string>",
      "issues": ["<string>"],
      "severity": "<none|minor|moderate|significant>"
    },
    "vocabulary": {
      "summary": "<string>",
      "issues": ["<string>"],
      "severity": "<none|minor|moderate|significant>"
    },
    "tenses": {
      "summary": "<string>",
      "issues": ["<string>"],
      "severity": "<none|minor|moderate|significant>"
    },
    "mechanics": {
      "summary": "<string>",
      "issues": ["<string>"],
      "severity": "<none|minor|moderate|significant>"
    },
    "structure": {
      "summary": "<string>",
      "issues": ["<string>"],
      "severity": "<none|minor|moderate|significant>"
    }
  },
  "strengths": ["<string>", "<string>", "<string>"],
  "improvements": ["<string>", "<string>", "<string>"],
  "teacher_feedback": "<string, 100-200 words, natural teacher voice, references specific elements of this student's writing, follows teacher instructions exactly, no generic phrases>"
}"""

MANUAL_SYSTEM_PROMPT = """You are a professional English teacher and writing evaluator with 15 years of classroom experience. Your task is to evaluate a single student's written assignment text and provide structured, insightful diagnostic feedback.

RULES YOU MUST FOLLOW:
1. The teacher has provided specific instructions for how to write feedback. You MUST follow these instructions exactly in structure, tone, and content when writing the teacher_feedback field. Do not deviate from the teacher's feedback format.
2. Write feedback that references the student's ACTUAL writing — quote or specifically refer to what they wrote.
3. NEVER use these phrases: "good effort", "well done", "keep practicing", "improve your grammar", "overall this is a good attempt", "you need to work on", "with practice you will improve", "this shows potential", "keep up the good work".
4. Sound like a real teacher who read this specific student's work.
5. If requirements are provided, evaluate each requirement objectively as PASS, FAIL, or PARTIAL with supporting detail from their text.
6. Provide a concise, insightful writing_quality_summary (2-3 sentences) summarizing grammar, vocabulary, structure, and quality.
7. Provide 2-3 genuine strengths and 2-3 specific areas for improvement.
8. Respond ONLY with valid JSON matching the schema. No preamble, no markdown, no explanation outside JSON."""

MANUAL_JSON_SCHEMA_EXAMPLE = """{
  "requirements": [
    {
      "description": "<string, exactly as given>",
      "status": "<PASS|FAIL|PARTIAL>",
      "detail": "<string, specific supporting detail from student text>"
    }
  ],
  "writing_quality_summary": "<string, short diagnostic paragraph (2-3 sentences) on grammar, vocabulary, structure, and overall quality>",
  "strengths": ["<string, specific strength with evidence>", "<string, specific strength>"],
  "improvements": ["<string, specific actionable area for improvement>", "<string, specific actionable area>"],
  "teacher_feedback": "<string, written strictly according to the teacher's feedback instructions, referencing actual writing>"
}"""


def build_user_prompt(
    assignment_title: str,
    assignment_type: str,
    total_marks: int,
    instructions: Optional[str],
    grading_notes: Optional[str],
    rubric_criteria: List[Dict[str, Any]],
    requirements: List[Dict[str, Any]],
    extracted_text: str,
    word_count: int,
    feedback_instructions: Optional[str] = None,
    error_feedback: Optional[str] = None,
) -> str:
    crit_lines = []
    anchor_lines = []
    for c in rubric_criteria:
        name = c["name"]
        m = c["max_marks"]
        desc = f": {c['description']}" if c.get("description") else ""
        crit_lines.append(f"- {name} (max {m} marks){desc}")
        anchor_lines.append(
            f"- {name}: 0 = no attempt or completely off-task; "
            f"{m // 2} = partial achievement with notable gaps; "
            f"{m} = full achievement with strong execution"
        )

    req_lines = [f"- {r['description']}" for r in requirements] if requirements else ["- No specific checklist requirements."]

    feedback_sec = ""
    if feedback_instructions:
        feedback_sec = f"""
TEACHER'S MANDATORY FEEDBACK INSTRUCTIONS:
{feedback_instructions}
(You MUST strictly follow these formatting and stylistic instructions for teacher_feedback.)
"""

    prompt = f"""ASSIGNMENT: {assignment_title}
TYPE: {assignment_type}
TOTAL MARKS: {total_marks}

INSTRUCTIONS:
{instructions or "None provided."}

RUBRIC CRITERIA:
{chr(10).join(crit_lines)}

GRADE ANCHORS FOR SCORING:
{chr(10).join(anchor_lines)}

REQUIREMENTS TO CHECK:
{chr(10).join(req_lines)}

GRADING NOTES FROM TEACHER:
{grading_notes if grading_notes else "None provided."}
{feedback_sec}
STUDENT SUBMISSION:
---
{extracted_text}
---
Word count: {word_count}

EXPECTED JSON SCHEMA:
{JSON_SCHEMA_EXAMPLE}

Evaluate this submission. Return ONLY valid JSON."""

    if error_feedback:
        prompt += f"""

CRITICAL FIX REQUIRED: Your previous attempt was rejected due to:
{error_feedback}
Please ensure all calculations, ranges, criteria names, and feedback length rules are strictly corrected. Return ONLY valid JSON."""

    return prompt


def build_manual_user_prompt(
    student_name: str,
    submission_text: str,
    word_count: int,
    assignment_title: str,
    assignment_type: str,
    instructions: Optional[str],
    requirements: Optional[List[Dict[str, Any]]],
    feedback_instructions: str,
) -> str:
    req_lines = (
        [f"- {r.get('description', '')}" for r in requirements if r.get('description')]
        if requirements
        else ["- No specific checklist requirements."]
    )

    prompt = f"""ASSIGNMENT: {assignment_title}
TYPE: {assignment_type}
STUDENT NAME: {student_name}

GENERAL INSTRUCTIONS:
{instructions or "None provided."}

REQUIREMENTS TO CHECK:
{chr(10).join(req_lines)}

TEACHER'S MANDATORY FEEDBACK INSTRUCTIONS:
{feedback_instructions}
(CRITICAL: The teacher_feedback field MUST strictly follow the above instructions in structure, content, tone, and format. Reference the student's actual writing.)

STUDENT SUBMISSION:
---
{submission_text}
---
Word count: {word_count}

EXPECTED JSON SCHEMA:
{MANUAL_JSON_SCHEMA_EXAMPLE}

Evaluate this submission. Return ONLY valid JSON matching the schema."""

    return prompt


class GeminiService:
    def __init__(self):
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_EVALUATIONS)
        if self.is_configured():
            try:
                genai.configure(api_key=settings.GEMINI_API_KEY)
            except Exception as e:
                log.warning("Initial genai.configure failed", error=str(e))

    def is_configured(self) -> bool:
        return bool(
            settings.GEMINI_API_KEY
            and settings.GEMINI_API_KEY != "your_gemini_api_key_here"
        )

    async def test_connection(self, api_key: Optional[str] = None) -> Tuple[bool, str]:
        """Tests the Gemini API connection with a lightweight model verification."""
        key = api_key or settings.GEMINI_API_KEY
        if not key or key == "your_gemini_api_key_here":
            return False, "Gemini API key is not configured."

        candidate_models = [settings.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.8-flash", "gemini-pro-latest"]
        seen = set()
        models_to_try = [m for m in candidate_models if not (m in seen or seen.add(m))]

        last_error = ""
        for model_name in models_to_try:
            clean_name = model_name if model_name.startswith("models/") else f"models/{model_name}"
            try:
                genai.configure(api_key=key)
                m_info = await asyncio.to_thread(genai.get_model, clean_name)
                if m_info:
                    resolved_name = model_name.replace("models/", "")
                    settings.GEMINI_MODEL = resolved_name
                    if api_key and api_key != settings.GEMINI_API_KEY:
                        settings.GEMINI_API_KEY = api_key
                    return True, f"Successfully connected to Gemini API ({resolved_name})."
            except Exception as e:
                err_msg = str(e)
                last_error = err_msg
                if "404" in err_msg or "not found" in err_msg.lower():
                    continue
                if "400" in err_msg or "403" in err_msg or "api_key_invalid" in err_msg.lower() or "invalid api key" in err_msg.lower():
                    return False, f"Invalid API key: {err_msg}"
                if "429" in err_msg or "quota" in err_msg.lower():
                    resolved_name = model_name.replace("models/", "")
                    settings.GEMINI_MODEL = resolved_name
                    return True, f"Connected to Gemini API ({resolved_name}) [Rate limit monitored]."

        return False, f"Connection failed: {last_error}"

    async def evaluate_submission(
        self,
        submission_id: str,
        assignment_title: str,
        assignment_type: str,
        total_marks: int,
        instructions: Optional[str],
        grading_notes: Optional[str],
        rubric_criteria: List[Dict[str, Any]],
        requirements: List[Dict[str, Any]],
        extracted_text: str,
        word_count: int,
        feedback_instructions: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Executes evaluation with concurrency control, error retry, schema validation,
        and mathematical verification.
        """
        if not self.is_configured():
            raise ValueError("Gemini API key is invalid or not configured. Please update it in Settings.")

        candidate_models = [settings.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.8-flash"]
        seen = set()
        models_to_try = [m for m in candidate_models if not (m in seen or seen.add(m))]
        model_idx = 0
        model_name = models_to_try[model_idx]

        gen_config = {
            "temperature": settings.GEMINI_TEMPERATURE,
            "max_output_tokens": settings.GEMINI_MAX_OUTPUT_TOKENS,
            "response_mime_type": "application/json",
        }

        genai.configure(api_key=settings.GEMINI_API_KEY)

        async with self._semaphore:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=SYSTEM_PROMPT,
                generation_config=gen_config,
            )

            error_feedback = None
            raw_response_text = ""
            prompt_tokens = 0
            completion_tokens = 0

            # Attempt validation retry up to 3 times total
            for attempt in range(1, 4):
                user_prompt = build_user_prompt(
                    assignment_title=assignment_title,
                    assignment_type=assignment_type,
                    total_marks=total_marks,
                    instructions=instructions,
                    grading_notes=grading_notes,
                    rubric_criteria=rubric_criteria,
                    requirements=requirements,
                    extracted_text=extracted_text,
                    word_count=word_count,
                    feedback_instructions=feedback_instructions,
                    error_feedback=error_feedback,
                )

                # Call API with retry for rate limit (429) and network/server errors
                try:
                    api_response = await self._call_api_with_retry(model, user_prompt, submission_id)
                except Exception as call_err:
                    if ("404" in str(call_err).lower() or "not found" in str(call_err).lower()) and model_idx + 1 < len(models_to_try):
                        model_idx += 1
                        model_name = models_to_try[model_idx]
                        settings.GEMINI_MODEL = model_name
                        log.info("Switching model to fallback", new_model=model_name)
                        model = genai.GenerativeModel(
                            model_name=model_name,
                            system_instruction=SYSTEM_PROMPT,
                            generation_config=gen_config,
                        )
                        api_response = await self._call_api_with_retry(model, user_prompt, submission_id)
                    else:
                        raise call_err
                raw_response_text = api_response.text

                # Estimate or capture tokens if available
                if hasattr(api_response, "usage_metadata") and api_response.usage_metadata:
                    prompt_tokens = getattr(api_response.usage_metadata, "prompt_token_count", 0)
                    completion_tokens = getattr(api_response.usage_metadata, "candidates_token_count", 0)

                # Parse JSON
                parsed_json = self._parse_json(raw_response_text)
                if not parsed_json:
                    error_feedback = "Response was not valid JSON. Ensure strictly valid JSON output."
                    log.warning(
                        "Evaluation JSON parse failed",
                        attempt=attempt,
                        submission_id=submission_id,
                    )
                    continue

                # Validate evaluation content and scores
                is_valid, validation_err, validated_data = validate_evaluation_json(
                    data=parsed_json,
                    expected_total_marks=total_marks,
                    rubric_criteria=rubric_criteria,
                    requirements=requirements,
                )

                if is_valid and validated_data:
                    log.info(
                        "Evaluation succeeded",
                        submission_id=submission_id,
                        total_score=validated_data["total_score"],
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )
                    return {
                        "success": True,
                        "data": validated_data,
                        "raw_response": raw_response_text,
                        "model": model_name,
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "status": "evaluated",
                    }
                else:
                    error_feedback = validation_err
                    log.warning(
                        "Evaluation validation failed",
                        attempt=attempt,
                        error=validation_err,
                        submission_id=submission_id,
                    )

            # If all 3 validation attempts fail, do not crash: return review_needed with raw response
            log.error(
                "Evaluation validation failed after 3 attempts",
                submission_id=submission_id,
                last_error=error_feedback,
            )
            return {
                "success": False,
                "error": error_feedback or "AI returned invalid response. Manual evaluation needed.",
                "raw_response": raw_response_text,
                "model": model_name,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "status": "review_needed",
            }

    async def evaluate_manual_submission(
        self,
        student_name: str,
        submission_text: str,
        assignment_title: str,
        assignment_type: str = "general",
        instructions: Optional[str] = None,
        requirements: Optional[List[Dict[str, Any]]] = None,
        feedback_instructions: str = "",
        word_count: int = 0,
    ) -> Dict[str, Any]:
        """
        Evaluates a single manual paste submission synchronously and quickly.
        Returns requirements results, writing quality summary, strengths, improvements,
        and teacher_feedback following the teacher's instructions exactly.
        """
        if not self.is_configured():
            raise ValueError("Gemini API key is invalid or not configured. Please update it in Settings.")

        candidate_models = [settings.GEMINI_MODEL, "gemini-flash-latest", "gemini-3.8-flash"]
        seen = set()
        models_to_try = [m for m in candidate_models if not (m in seen or seen.add(m))]
        model_idx = 0
        model_name = models_to_try[model_idx]

        gen_config = {
            "temperature": settings.GEMINI_TEMPERATURE,
            "max_output_tokens": settings.GEMINI_MAX_OUTPUT_TOKENS,
            "response_mime_type": "application/json",
        }

        genai.configure(api_key=settings.GEMINI_API_KEY)

        async with self._semaphore:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=MANUAL_SYSTEM_PROMPT,
                generation_config=gen_config,
            )

            user_prompt = build_manual_user_prompt(
                student_name=student_name,
                submission_text=submission_text,
                word_count=word_count,
                assignment_title=assignment_title,
                assignment_type=assignment_type,
                instructions=instructions,
                requirements=requirements,
                feedback_instructions=feedback_instructions,
            )

            try:
                api_response = await self._call_api_with_retry(model, user_prompt, f"manual_{student_name}")
            except Exception as call_err:
                if ("404" in str(call_err).lower() or "not found" in str(call_err).lower()) and model_idx + 1 < len(models_to_try):
                    model_idx += 1
                    model_name = models_to_try[model_idx]
                    settings.GEMINI_MODEL = model_name
                    model = genai.GenerativeModel(
                        model_name=model_name,
                        system_instruction=MANUAL_SYSTEM_PROMPT,
                        generation_config=gen_config,
                    )
                    api_response = await self._call_api_with_retry(model, user_prompt, f"manual_{student_name}")
                else:
                    raise call_err

            raw_text = api_response.text
            parsed_json = self._parse_json(raw_text)

            if not parsed_json or not isinstance(parsed_json, dict):
                parsed_json = {
                    "requirements": [],
                    "writing_quality_summary": "Evaluation completed.",
                    "strengths": [],
                    "improvements": [],
                    "teacher_feedback": raw_text.strip(),
                }

            # Normalise requirements results
            norm_requirements = []
            for r in parsed_json.get("requirements", []):
                if isinstance(r, dict):
                    status_val = str(r.get("status", "PASS")).upper()
                    if status_val not in ("PASS", "FAIL", "PARTIAL"):
                        status_val = "PASS"
                    norm_requirements.append({
                        "description": r.get("description", ""),
                        "status": status_val,
                        "detail": r.get("detail", ""),
                    })

            strengths_list = [str(s) for s in parsed_json.get("strengths", []) if s]
            improvements_list = [str(i) for i in parsed_json.get("improvements", []) if i]

            return {
                "success": True,
                "data": {
                    "requirements": norm_requirements,
                    "writing_quality_summary": str(parsed_json.get("writing_quality_summary", "")),
                    "strengths": strengths_list,
                    "improvements": improvements_list,
                    "teacher_feedback": str(parsed_json.get("teacher_feedback", "")),
                },
                "model": model_name,
                "raw_response": raw_text,
            }

    async def _call_api_with_retry(self, model: Any, prompt: str, submission_id: str) -> Any:
        """Handles 429 rate limits, 500 server errors, and network errors."""
        rate_limit_delays = [5, 10, 20]
        rate_limit_attempt = 0
        server_retry = 0

        while True:
            try:
                # Run synchronous SDK call in thread pool
                response = await asyncio.to_thread(model.generate_content, prompt)
                return response
            except Exception as e:
                err_str = str(e).lower()

                # Check 429 / resource exhausted
                if "429" in err_str or "quota" in err_str or "resource exhausted" in err_str:
                    if rate_limit_attempt < len(rate_limit_delays):
                        delay = rate_limit_delays[rate_limit_attempt]
                        rate_limit_attempt += 1
                        log.warning(
                            "Rate limit hit, retrying",
                            delay=delay,
                            submission_id=submission_id,
                        )
                        await asyncio.sleep(delay)
                        continue
                    else:
                        raise RuntimeError(f"Gemini rate limit exceeded after retries: {e}")

                # Check 500 / 503 server errors
                elif "500" in err_str or "503" in err_str or "internal" in err_str:
                    server_retry += 1
                    if server_retry <= 3:
                        log.warning("Server error from Gemini, retrying immediately", attempt=server_retry)
                        await asyncio.sleep(1)
                        continue
                    else:
                        raise RuntimeError(f"Gemini server error after 3 retries: {e}")

                # Check 404 model not found (raise immediately for model fallback)
                elif "404" in err_str or "not found" in err_str:
                    raise e

                # Other network/connection errors
                else:
                    if server_retry < 2:
                        server_retry += 1
                        log.warning("Network error, retrying", attempt=server_retry, error=str(e))
                        await asyncio.sleep(2)
                        continue
                    else:
                        raise RuntimeError(f"Gemini API request failed: {e}")

    def _parse_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Cleans and extracts JSON object from response string."""
        if not text:
            return None
        text = text.strip()
        # Remove markdown code block fences if present
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            text = text.strip()

        try:
            return json.loads(text)
        except Exception:
            # Fallback: find first '{' and last '}'
            m = re.search(r"(\{.*\})", text, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group(1))
                except Exception:
                    pass
        return None


gemini_service = GeminiService()


def configure_gemini(api_key: Optional[str] = None):
    """Configures Google Generative AI SDK with API key from settings or argument."""
    key = api_key or settings.GEMINI_API_KEY
    if key and key != "your_gemini_api_key_here":
        os.environ["GOOGLE_API_KEY"] = key
        os.environ["GEMINI_API_KEY"] = key
        genai.configure(api_key=key)


def build_evaluation_prompt(assignment: Any, submission_text: str) -> str:
    """Convenience wrapper to build an evaluation prompt from an assignment model/dict."""
    title = getattr(assignment, "title", "") if not isinstance(assignment, dict) else assignment.get("title", "")
    a_type = getattr(assignment, "type", "essay") if not isinstance(assignment, dict) else assignment.get("type", "essay")
    total_marks = getattr(assignment, "total_marks", 20) if not isinstance(assignment, dict) else assignment.get("total_marks", 20)
    instructions = getattr(assignment, "instructions", None) if not isinstance(assignment, dict) else assignment.get("instructions")
    grading_notes = getattr(assignment, "grading_notes", None) if not isinstance(assignment, dict) else assignment.get("grading_notes")
    feedback_instructions = getattr(assignment, "feedback_instructions", None) if not isinstance(assignment, dict) else assignment.get("feedback_instructions")

    raw_criteria = getattr(assignment, "rubric_criteria", []) if not isinstance(assignment, dict) else assignment.get("rubric_criteria", [])
    criteria = []
    for c in raw_criteria:
        if isinstance(c, dict):
            criteria.append(c)
        else:
            criteria.append({
                "id": str(getattr(c, "id", "")),
                "name": getattr(c, "name", ""),
                "max_marks": getattr(c, "max_marks", 0),
                "description": getattr(c, "description", None),
            })

    raw_reqs = getattr(assignment, "requirements", []) if not isinstance(assignment, dict) else assignment.get("requirements", [])
    requirements = []
    for r in raw_reqs:
        if isinstance(r, dict):
            requirements.append(r)
        else:
            requirements.append({
                "id": str(getattr(r, "id", "")),
                "description": getattr(r, "description", ""),
            })

    words = len(submission_text.split())
    return build_user_prompt(
        assignment_title=title,
        assignment_type=a_type,
        total_marks=total_marks,
        instructions=instructions,
        grading_notes=grading_notes,
        rubric_criteria=criteria,
        requirements=requirements,
        extracted_text=submission_text,
        word_count=words,
        feedback_instructions=feedback_instructions,
    )

