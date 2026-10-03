/**
 * GradeWise API Client
 * Typed wrapper around axios.
 * The Gemini API key is NEVER stored or referenced here.
 */

import axios, { AxiosError } from "axios";
import type { ApiError } from "../types";

export const BASE_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";

export const getApiUrl = (path: string): string => {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
};

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60_000,
});

// Request interceptor — attach auth token if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("gradewise_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — normalize errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const message =
      error.response?.data?.error ||
      error.response?.data?.detail ||
      error.message ||
      "An unexpected error occurred";

    return Promise.reject(new Error(message));
  }
);

export default apiClient;
