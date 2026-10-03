import apiClient from "./client";
import type {
  CreateManualSessionPayload,
  ManualEvaluation,
  ManualEvaluatePayload,
  ManualSession,
  UpdateManualEvaluationPayload,
  UpdateManualSessionPayload,
} from "../types";

export const manualApi = {
  createSession: async (payload: CreateManualSessionPayload): Promise<ManualSession> => {
    const { data } = await apiClient.post<ManualSession>("/api/manual/sessions", payload);
    return data;
  },

  listSessions: async (): Promise<ManualSession[]> => {
    const { data } = await apiClient.get<ManualSession[]>("/api/manual/sessions");
    return data;
  },

  getSession: async (id: string): Promise<ManualSession> => {
    const { data } = await apiClient.get<ManualSession>(`/api/manual/sessions/${id}`);
    return data;
  },

  updateSession: async (id: string, payload: UpdateManualSessionPayload): Promise<ManualSession> => {
    const { data } = await apiClient.put<ManualSession>(`/api/manual/sessions/${id}`, payload);
    return data;
  },

  deleteSession: async (id: string): Promise<{ status: string; id: string }> => {
    const { data } = await apiClient.delete<{ status: string; id: string }>(`/api/manual/sessions/${id}`);
    return data;
  },

  evaluateSubmission: async (sessionId: string, payload: ManualEvaluatePayload): Promise<ManualEvaluation> => {
    const { data } = await apiClient.post<ManualEvaluation>(
      `/api/manual/sessions/${sessionId}/evaluate`,
      payload
    );
    return data;
  },

  updateEvaluation: async (id: string, payload: UpdateManualEvaluationPayload): Promise<ManualEvaluation> => {
    const { data } = await apiClient.put<ManualEvaluation>(`/api/manual/evaluations/${id}`, payload);
    return data;
  },

  deleteEvaluation: async (id: string): Promise<{ status: string; id: string }> => {
    const { data } = await apiClient.delete<{ status: string; id: string }>(`/api/manual/evaluations/${id}`);
    return data;
  },

  getExportUrl: (sessionId: string, format: "csv" | "pdf" | "docx"): string => {
    return `/api/manual/sessions/${sessionId}/export?format=${format}`;
  },

  downloadExport: async (sessionId: string, format: "csv" | "pdf" | "docx", filename?: string): Promise<void> => {
    const response = await apiClient.get(`/api/manual/sessions/${sessionId}/export?format=${format}`, {
      responseType: "blob",
    });
    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename || `manual_session_evaluations.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },
};
