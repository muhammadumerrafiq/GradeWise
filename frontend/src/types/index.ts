// ============================================================
// GRADEWISE — TypeScript Type Definitions
// ============================================================

export type AssignmentType =
  | "essay"
  | "narrative"
  | "descriptive"
  | "paragraph"
  | "letter"
  | "report"
  | "creative"
  | "general"
  | "custom";

export type AssignmentStatus = "draft" | "active" | "archived";

export type SubmissionStatus =
  | "pending"
  | "name_pending"
  | "extracting"
  | "extraction_failed"
  | "queued"
  | "processing"
  | "evaluated"
  | "review_needed"
  | "approved"
  | "failed";

export type EvalStatus = "pending_review" | "reviewed" | "approved";

export type RequirementStatus = "PASS" | "FAIL" | "PARTIAL";

export type EnglishSeverity = "none" | "minor" | "moderate" | "significant";

export type ExportType =
  | "individual_pdf"
  | "individual_docx"
  | "bulk_zip_pdf"
  | "bulk_zip_docx"
  | "excel_summary"
  | "csv_summary";

// ---- Domain Types ----

export interface GradeScaleEntry {
  min_pct: number;
  label: string;
}

export interface RubricCriterion {
  id: string;
  assignment_id: string;
  name: string;
  max_marks: number;
  description?: string;
  sort_order: number;
}

export interface Requirement {
  id: string;
  assignment_id: string;
  description: string;
  sort_order: number;
}

export interface Assignment {
  id: string;
  teacher_id: string;
  title: string;
  type: AssignmentType;
  instructions?: string;
  grading_notes?: string;
  feedback_instructions?: string;
  total_marks: number;
  grade_scale?: GradeScaleEntry[];
  status: AssignmentStatus;
  rubric_criteria: RubricCriterion[];
  requirements: Requirement[];
  created_at: string;
  updated_at: string;
}

// ---- Module 2: Manual Paste Types ----

export interface ManualRequirementItem {
  description: string;
}

export interface ManualRequirementResultItem {
  description: string;
  status: "PASS" | "FAIL" | "PARTIAL";
  detail?: string;
}

export interface ManualEvaluation {
  id: string;
  session_id: string;
  student_name: string;
  submission_text: string;
  word_count: number;
  requirements_result: ManualRequirementResultItem[];
  writing_quality_summary?: string;
  strengths: string[];
  improvements: string[];
  ai_feedback?: string;
  teacher_feedback?: string;
  gemini_model?: string;
  status: "processing" | "complete" | "failed";
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface ManualSession {
  id: string;
  teacher_id: string;
  title: string;
  assignment_type: AssignmentType;
  instructions?: string;
  requirements: ManualRequirementItem[];
  feedback_instructions: string;
  evaluations_count: number;
  created_at: string;
  updated_at: string;
  evaluations?: ManualEvaluation[];
}

export interface CreateManualSessionPayload {
  title: string;
  assignment_type: AssignmentType;
  instructions?: string;
  requirements: ManualRequirementItem[];
  feedback_instructions: string;
}

export interface UpdateManualSessionPayload {
  title?: string;
  assignment_type?: AssignmentType;
  instructions?: string;
  requirements?: ManualRequirementItem[];
  feedback_instructions?: string;
}

export interface ManualEvaluatePayload {
  student_name: string;
  submission_text: string;
}

export interface UpdateManualEvaluationPayload {
  teacher_feedback: string;
}

export interface AssignmentStats {
  assignment_id: string;
  title: string;
  type: AssignmentType;
  total_marks: number;
  status: AssignmentStatus;
  created_at: string;
  total_submissions: number;
  approved_count: number;
  pending_review_count: number;
  error_count: number;
  avg_percentage: number | null;
  min_score: number | null;
  max_score: number | null;
}

export interface Student {
  id: string;
  name: string;
  section?: string;
  roll_number?: string;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id?: string;
  original_filename: string;
  file_type?: string;
  word_count?: number;
  detected_name?: string;
  name_confidence?: number;
  name_flagged: boolean;
  status: SubmissionStatus;
  error_message?: string;
  retry_count: number;
  uploaded_at: string;
  extracted_text?: string;
  student?: Student;
}

export interface RequirementResult {
  description: string;
  status: RequirementStatus;
  detail: string;
}

export interface EnglishCategory {
  summary: string;
  issues: string[];
  severity: EnglishSeverity;
}

export interface EnglishAnalysis {
  grammar: EnglishCategory;
  vocabulary: EnglishCategory;
  tenses: EnglishCategory;
  mechanics: EnglishCategory;
  structure: EnglishCategory;
}

export interface CriterionScore {
  id: string;
  evaluation_id: string;
  criterion_id: string;
  criterion_name: string;
  score: number;
  max_score: number;
  rationale?: string;
  evidence?: string;
}

export interface Evaluation {
  id: string;
  submission_id: string;
  total_score: number;
  max_score: number;
  percentage: number;
  grade_label?: string;
  requirements_result: RequirementResult[];
  english_analysis: EnglishAnalysis;
  strengths: string[];
  improvements: string[];
  ai_feedback: string;
  teacher_feedback: string;
  teacher_notes?: string;
  eval_status: EvalStatus;
  criterion_scores: CriterionScore[];
  gemini_model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  raw_gemini_response?: string;
  generated_at?: string;
  approved_at?: string;
  updated_at: string;
  submission?: Submission;
}

export interface SubmissionResultRow {
  submission_id: string;
  assignment_id: string;
  student_id?: string;
  student_name: string;
  original_filename: string;
  word_count?: number;
  status: string;
  evaluation_id?: string;
  total_score?: number;
  max_score?: number;
  percentage?: number;
  grade_label?: string;
  eval_status?: string;
  teacher_feedback?: string;
  error_message?: string;
  uploaded_at: string;
  generated_at?: string;
  approved_at?: string;
}

export interface ResultsListResponse {
  items: SubmissionResultRow[];
  total: number;
  distribution_summary: string;
}

export interface ProcessingProgress {
  assignment_id: string;
  status: "running" | "paused" | "completed" | "cancelled" | "failed";
  total_count: number;
  completed_count: number;
  failed_count: number;
  current_name?: string;
  completed_list: Array<{
    name: string;
    score?: number;
    max_score?: number;
  }>;
  queued_names: string[];
  errors: Array<{
    name: string;
    submission_id: string;
    error: string;
  }>;
  estimated_seconds_remaining?: number;
}

export interface ExportRecord {
  id: string;
  assignment_id: string;
  export_type: ExportType;
  file_path: string;
  file_size_bytes?: number;
  submission_count?: number;
  created_at: string;
  download_url: string;
}

export interface SettingsData {
  teacher_name: string;
  teacher_email?: string;
  gemini_api_key_configured: boolean;
  gemini_api_key_masked: string;
  gemini_model: string;
  grade_scale: GradeScaleEntry[];
  storage_used_bytes: number;
  auto_delete_days: number;
  default_export_format: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
