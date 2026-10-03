import apiClient from "./client";
import type {
  Assignment,
  AssignmentStats,
  Evaluation,
  ExportRecord,
  ProcessingProgress,
  ResultsListResponse,
  SettingsData,
  Submission,
} from "../types";

// ============================================================
// ASSIGNMENTS
// ============================================================

export async function listAssignments(
  status?: string,
  search?: string
): Promise<AssignmentStats[]> {
  const params: Record<string, string> = {};
  if (status && status !== "all") params.status = status;
  if (search) params.search = search;
  const res = await apiClient.get<AssignmentStats[]>("/api/assignments", { params });
  return res.data;
}

export async function getAssignment(id: string): Promise<Assignment> {
  const res = await apiClient.get<Assignment>(`/api/assignments/${id}`);
  return res.data;
}

export async function createAssignment(data: any): Promise<Assignment> {
  const res = await apiClient.post<Assignment>("/api/assignments", data);
  return res.data;
}

export async function updateAssignment(id: string, data: any): Promise<Assignment> {
  const res = await apiClient.put<Assignment>(`/api/assignments/${id}`, data);
  return res.data;
}

export async function deleteAssignment(
  id: string,
  archiveOnly = false
): Promise<{ status: string }> {
  const res = await apiClient.delete<{ status: string }>(`/api/assignments/${id}`, {
    params: { archive_only: archiveOnly },
  });
  return res.data;
}

// ============================================================
// SUBMISSIONS & UPLOAD
// ============================================================

export async function uploadSubmissions(
  assignmentId: string,
  files: File[]
): Promise<Submission[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  const res = await apiClient.post<Submission[]>(
    `/api/assignments/${assignmentId}/upload`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    }
  );
  return res.data;
}

export async function listSubmissions(assignmentId: string): Promise<Submission[]> {
  const res = await apiClient.get<Submission[]>(
    `/api/assignments/${assignmentId}/submissions`
  );
  return res.data;
}

export async function updateSubmissionStudent(
  submissionId: string,
  studentName: string,
  section?: string
): Promise<Submission> {
  const res = await apiClient.put<Submission>(`/api/submissions/${submissionId}/student`, {
    student_name: studentName,
    section,
  });
  return res.data;
}

export async function batchResolveNames(
  assignmentId: string,
  resolutions: Array<{ submission_id: string; student_name: string }>
): Promise<{ status: string; updated_count: number }> {
  const res = await apiClient.post<{ status: string; updated_count: number }>(
    `/api/assignments/${assignmentId}/name-mapping/batch`,
    { resolutions }
  );
  return res.data;
}

export async function deleteSubmission(id: string): Promise<{ status: string }> {
  const res = await apiClient.delete<{ status: string }>(`/api/submissions/${id}`);
  return res.data;
}

// ============================================================
// EVALUATION & PROCESSING
// ============================================================

export async function startBatchEvaluation(
  assignmentId: string
): Promise<{ status: string; assignment_id: string; total_queued: number }> {
  const res = await apiClient.post<{
    status: string;
    assignment_id: string;
    total_queued: number;
  }>(`/api/assignments/${assignmentId}/evaluate`);
  return res.data;
}

export async function getProcessingProgress(
  assignmentId: string
): Promise<ProcessingProgress> {
  const res = await apiClient.get<ProcessingProgress>(
    `/api/assignments/${assignmentId}/progress`
  );
  return res.data;
}

export async function pauseEvaluation(assignmentId: string): Promise<{ status: string }> {
  const res = await apiClient.post<{ status: string }>(
    `/api/assignments/${assignmentId}/pause`
  );
  return res.data;
}

export async function resumeEvaluation(assignmentId: string): Promise<{ status: string }> {
  const res = await apiClient.post<{ status: string }>(
    `/api/assignments/${assignmentId}/resume`
  );
  return res.data;
}

export async function cancelEvaluation(assignmentId: string): Promise<{ status: string }> {
  const res = await apiClient.post<{ status: string }>(
    `/api/assignments/${assignmentId}/cancel`
  );
  return res.data;
}

export async function retrySubmission(
  submissionId: string
): Promise<{ status: string; submission_id: string }> {
  const res = await apiClient.post<{ status: string; submission_id: string }>(
    `/api/submissions/${submissionId}/retry`
  );
  return res.data;
}

export async function regenerateSubmission(
  submissionId: string,
  type: "full" | "feedback" = "full"
): Promise<{ status: string; submission_id: string }> {
  const res = await apiClient.post<{ status: string; submission_id: string }>(
    `/api/submissions/${submissionId}/regenerate`,
    null,
    { params: { regenerate_type: type } }
  );
  return res.data;
}

// ============================================================
// RESULTS & STUDENT DETAIL
// ============================================================

export async function getResults(
  assignmentId: string,
  params?: { status?: string; search?: string; sort_by?: string }
): Promise<ResultsListResponse> {
  const res = await apiClient.get<ResultsListResponse>(
    `/api/assignments/${assignmentId}/results`,
    { params }
  );
  return res.data;
}

export async function getEvaluation(id: string): Promise<Evaluation> {
  const res = await apiClient.get<Evaluation>(`/api/evaluations/${id}`);
  return res.data;
}

export async function updateEvaluation(
  id: string,
  data: Partial<Evaluation> | { criterion_scores?: any[]; teacher_feedback?: string; teacher_notes?: string; eval_status?: string }
): Promise<Evaluation> {
  const res = await apiClient.put<Evaluation>(`/api/evaluations/${id}`, data);
  return res.data;
}

export async function approveEvaluation(id: string): Promise<Evaluation> {
  const res = await apiClient.post<Evaluation>(`/api/evaluations/${id}/approve`);
  return res.data;
}

// ============================================================
// EXPORTS
// ============================================================

export async function createExport(
  assignmentId: string,
  exportType: string,
  submissionIds?: string[]
): Promise<ExportRecord> {
  const res = await apiClient.post<ExportRecord>(
    `/api/assignments/${assignmentId}/export`,
    {
      export_type: exportType,
      submission_ids: submissionIds,
    }
  );
  return res.data;
}

export async function listExports(assignmentId: string): Promise<ExportRecord[]> {
  const res = await apiClient.get<ExportRecord[]>(
    `/api/assignments/${assignmentId}/exports`
  );
  return res.data;
}

// ============================================================
// SETTINGS
// ============================================================

export async function getSettings(): Promise<SettingsData> {
  const res = await apiClient.get<SettingsData>("/api/settings");
  return res.data;
}

export async function updateSettings(data: any): Promise<SettingsData> {
  const res = await apiClient.put<SettingsData>("/api/settings", data);
  return res.data;
}

export async function testGeminiKey(
  apiKey?: string
): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post<{ success: boolean; message: string }>(
    "/api/settings/test-gemini",
    { api_key: apiKey }
  );
  return res.data;
}
