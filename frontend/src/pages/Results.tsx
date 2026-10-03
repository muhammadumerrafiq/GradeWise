import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Download,
  Copy,
  Eye,
  FileSpreadsheet,
  FileText,
  FileArchive,
  ArrowLeft,
  RotateCw,
  Play,
} from "lucide-react";
import {
  getAssignment,
  getResults,
  createExport,
  retrySubmission,
  startBatchEvaluation,
} from "../api";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { copyToClipboard } from "../utils/clipboard";
import { getApiUrl } from "../api/client";

export const Results: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("score_desc");
  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const { data: assignment } = useQuery({
    queryKey: ["assignment", id],
    queryFn: () => getAssignment(id!),
    enabled: !!id,
  });

  const { data: resultsData, isLoading } = useQuery({
    queryKey: ["results", id, statusFilter, searchQuery, sortBy],
    queryFn: () =>
      getResults(id!, {
        status: statusFilter,
        search: searchQuery,
        sort_by: sortBy,
      }),
    enabled: !!id,
  });

  const exportMutation = useMutation({
    mutationFn: (formatType: string) => {
      const ids = selectedSubIds.length > 0 ? selectedSubIds : undefined;
      return createExport(id!, formatType, ids);
    },
    onSuccess: (data) => {
      showToast("Export generated! Downloading...", "success");
      setShowExportMenu(false);
      // Trigger download
      window.location.href = getApiUrl(data.download_url);
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to generate export", "error");
    },
  });

  const startEvalMutation = useMutation({
    mutationFn: () => startBatchEvaluation(id!),
    onSuccess: () => navigate(`/assignments/${id}/processing`),
    onError: (err: any) => showToast(err.message || "Could not start evaluation", "error"),
  });

  const retryMutation = useMutation({
    mutationFn: (subId: string) => retrySubmission(subId),
    onSuccess: () => {
      showToast("Evaluation retry started", "info");
      navigate(`/assignments/${id}/processing`);
    },
  });

  const toggleSelectAll = () => {
    if (!resultsData?.items) return;
    if (selectedSubIds.length === resultsData.items.length) {
      setSelectedSubIds([]);
    } else {
      setSelectedSubIds(resultsData.items.map((i) => i.submission_id));
    }
  };

  const toggleSelectOne = (subId: string) => {
    if (selectedSubIds.includes(subId)) {
      setSelectedSubIds(selectedSubIds.filter((x) => x !== subId));
    } else {
      setSelectedSubIds([...selectedSubIds, subId]);
    }
  };

  const handleCopyScore = async (row: any) => {
    const text = `${row.total_score}/${row.max_score} (${row.percentage?.toFixed(1)}%) — ${row.grade_label || ""}`;
    const success = await copyToClipboard(text);
    if (success) {
      showToast("Copied score!", "success");
    } else {
      showToast("Failed to copy score", "error");
    }
  };

  const handleCopyFeedback = async (row: any) => {
    if (row.teacher_feedback) {
      const success = await copyToClipboard(row.teacher_feedback);
      if (success) {
        showToast("Copied feedback!", "success");
      } else {
        showToast("Failed to copy feedback", "error");
      }
    } else {
      showToast("No feedback available yet", "error");
    }
  };

  const handleDownloadPDF = (submissionId: string) => {
    window.location.href = getApiUrl(`/api/export/single/${submissionId}/pdf`);
  };

  const rows = resultsData?.items || [];
  const hasResults = rows.some((r) => r.evaluation_id);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/assignments/${id}`)}
            className="text-text-secondary hover:text-text-primary p-1 rounded hover:bg-surface transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              Results: {assignment?.title || "Assignment"}
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Total: {assignment?.total_marks} Marks · {rows.length} Submissions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          {selectedSubIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={() => exportMutation.mutate("bulk_zip_pdf")}
              disabled={exportMutation.isPending}
            >
              Export Selected ({selectedSubIds.length})
            </Button>
          )}

          {/* Export All Dropdown */}
          <div className="relative">
            <Button
              variant="primary"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exportMutation.isPending}
            >
              Export All ▼
            </Button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg py-1 z-30 text-sm">
                <button
                  onClick={() => exportMutation.mutate("bulk_zip_pdf")}
                  className="w-full text-left px-4 py-2 hover:bg-background flex items-center gap-2 text-text-primary"
                >
                  <FileArchive className="w-4 h-4 text-accent" />
                  PDF Reports (ZIP)
                </button>
                <button
                  onClick={() => exportMutation.mutate("excel_summary")}
                  className="w-full text-left px-4 py-2 hover:bg-background flex items-center gap-2 text-text-primary"
                >
                  <FileSpreadsheet className="w-4 h-4 text-status-success" />
                  Excel Summary (.xlsx)
                </button>
                <button
                  onClick={() => exportMutation.mutate("csv_summary")}
                  className="w-full text-left px-4 py-2 hover:bg-background flex items-center gap-2 text-text-primary"
                >
                  <FileText className="w-4 h-4 text-text-secondary" />
                  CSV Summary (.csv)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Score Distribution Text Summary (No charts as instructed) */}
      <div className="p-3 bg-surface border border-border rounded-lg text-xs font-mono text-text-secondary flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-text-primary font-sans">Score Distribution:</span>
        <span className="font-mono text-text-primary font-medium">
          {resultsData?.distribution_summary || "Calculating..."}
        </span>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-border w-full sm:w-auto overflow-x-auto">
          {[
            { key: "all", label: "All" },
            { key: "pending_review", label: "Pending Review" },
            { key: "reviewed", label: "Reviewed" },
            { key: "approved", label: "Approved" },
            { key: "errors", label: "Errors" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Sort Dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs bg-surface border border-border rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="score_desc">Score (Highest)</option>
            <option value="score_asc">Score (Lowest)</option>
            <option value="name">Name (A-Z)</option>
            <option value="percentage">Percentage</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* Results Table */}
      <Card>
        {isLoading ? (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        ) : rows.length === 0 ? (
          <CardBody className="text-center py-16">
            <FileText className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
            <p className="text-base font-semibold text-text-primary mb-1">
              Evaluation not started
            </p>
            <p className="text-xs text-text-secondary max-w-sm mx-auto mb-4">
              Upload submissions and run batch evaluation to generate scores and feedback.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<Play className="w-3.5 h-3.5" />}
              onClick={() => startEvalMutation.mutate()}
            >
              Start Evaluation
            </Button>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-text-secondary text-xs uppercase font-medium">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedSubIds.length === rows.length && rows.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                  </th>
                  <th className="px-5 py-3">Student Name</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-3 py-3">/ Max</th>
                  <th className="px-4 py-3">%</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const isSelected = selectedSubIds.includes(r.submission_id);
                  const isError =
                    r.status === "error" ||
                    r.status === "failed" ||
                    r.status === "extraction_failed";

                  return (
                    <tr
                      key={r.submission_id}
                      className={`hover:bg-[#F9FAFB] transition-colors ${
                        isSelected ? "bg-accent-light/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(r.submission_id)}
                          className="rounded border-border text-accent focus:ring-accent"
                        />
                      </td>

                      <td className="px-5 py-3.5 font-medium text-text-primary">
                        {r.evaluation_id ? (
                          <Link
                            to={`/evaluations/${r.evaluation_id}`}
                            className="hover:text-accent font-semibold block"
                          >
                            {r.student_name}
                          </Link>
                        ) : (
                          <span>{r.student_name}</span>
                        )}
                        <span className="block text-[11px] text-text-tertiary font-mono">
                          {r.original_filename}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-text-primary">
                        {r.total_score !== null && r.total_score !== undefined
                          ? r.total_score
                          : "-"}
                      </td>

                      <td className="px-3 py-3.5 text-text-secondary">
                        {r.max_score}
                      </td>

                      <td className="px-4 py-3.5 text-text-secondary">
                        {r.percentage !== null && r.percentage !== undefined
                          ? `${r.percentage.toFixed(1)}%`
                          : "-"}
                      </td>

                      <td className="px-4 py-3.5 font-bold text-text-primary">
                        {r.grade_label || "-"}
                      </td>

                      <td className="px-5 py-3.5">
                        <Badge
                          variant={
                            r.status === "approved"
                              ? "approved"
                              : r.status === "reviewed"
                              ? "reviewed"
                              : r.status === "pending_review"
                              ? "pending_review"
                              : isError
                              ? "error"
                              : "default"
                          }
                        >
                          {r.status.replace("_", " ")}
                        </Badge>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.evaluation_id ? (
                            <>
                              <button
                                onClick={() => navigate(`/evaluations/${r.evaluation_id}`)}
                                className="p-1.5 text-text-secondary hover:text-accent rounded hover:bg-background"
                                title="View Evaluation"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleCopyFeedback(r)}
                                className="p-1.5 text-text-secondary hover:text-accent rounded hover:bg-background"
                                title="Copy Feedback"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDownloadPDF(r.submission_id)}
                                className="p-1.5 text-text-secondary hover:text-accent rounded hover:bg-background"
                                title="Download PDF Report"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </>
                          ) : isError ? (
                            <button
                              onClick={() => retryMutation.mutate(r.submission_id)}
                              className="px-2 py-1 text-xs font-medium text-status-error hover:bg-red-50 rounded flex items-center gap-1 border border-red-200"
                              title="Retry evaluation"
                            >
                              <RotateCw className="w-3 h-3" /> Retry
                            </button>
                          ) : (
                            <span className="text-xs text-text-tertiary">Queued</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
