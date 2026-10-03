import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileSpreadsheet, FileText, FileArchive, CheckSquare, Clock } from "lucide-react";
import { getAssignment, getResults, listExports, createExport } from "../api";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import { format } from "date-fns";

export const ExportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [selectionMode, setSelectionMode] = useState<"all" | "approved" | "pending" | "custom">("all");
  const [selectedFormat, setSelectedFormat] = useState<"pdf" | "docx">("pdf");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: assignment } = useQuery({
    queryKey: ["assignment", id],
    queryFn: () => getAssignment(id!),
    enabled: !!id,
  });

  const { data: resultsData } = useQuery({
    queryKey: ["results", id],
    queryFn: () => getResults(id!),
    enabled: !!id,
  });

  const { data: exportHistory, isLoading: loadingExports } = useQuery({
    queryKey: ["exports", id],
    queryFn: () => listExports(id!),
    enabled: !!id,
  });

  const evaluatedItems = resultsData?.items.filter((i) => i.evaluation_id) || [];

  const getSubmissionsForExport = (): string[] => {
    if (selectionMode === "approved") {
      return evaluatedItems.filter((i) => i.status === "approved").map((i) => i.submission_id);
    }
    if (selectionMode === "pending") {
      return evaluatedItems.filter((i) => i.status === "pending_review").map((i) => i.submission_id);
    }
    if (selectionMode === "custom") {
      return selectedIds;
    }
    return evaluatedItems.map((i) => i.submission_id);
  };

  const exportMutation = useMutation({
    mutationFn: (exportType: string) => {
      const subIds = getSubmissionsForExport();
      return createExport(id!, exportType, subIds);
    },
    onSuccess: (data) => {
      showToast("Export file generated! Starting download...", "success");
      queryClient.invalidateQueries({ queryKey: ["exports", id] });
      window.location.href = data.download_url;
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to generate export", "error");
    },
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <button
          onClick={() => navigate(`/assignments/${id}`)}
          className="text-text-secondary hover:text-text-primary p-1.5 rounded hover:bg-surface transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            Export Results: {assignment?.title || "Assignment"}
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Generate individual student evaluation reports or grade spreadsheets
          </p>
        </div>
      </div>

      {/* Section 1: Individual Exports */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            1. Individual Student Reports (ZIP Archive)
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Select Submissions to Include:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: "all", label: `All Evaluated (${evaluatedItems.length})` },
                {
                  key: "approved",
                  label: `Approved Only (${evaluatedItems.filter((i) => i.status === "approved").length})`,
                },
                {
                  key: "pending",
                  label: `Pending Review (${evaluatedItems.filter((i) => i.status === "pending_review").length})`,
                },
                { key: "custom", label: "Custom Selection" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectionMode(opt.key as any)}
                  className={`p-3 rounded border text-left text-xs font-medium transition-colors ${
                    selectionMode === opt.key
                      ? "bg-accent-light border-accent text-accent"
                      : "bg-surface border-border text-text-primary hover:bg-background"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom selection checkboxes if custom mode */}
          {selectionMode === "custom" && (
            <div className="max-h-48 overflow-y-auto border border-border rounded p-3 space-y-2 bg-background">
              {evaluatedItems.map((item) => (
                <label
                  key={item.submission_id}
                  className="flex items-center gap-2 text-xs text-text-primary cursor-pointer hover:bg-surface p-1 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.submission_id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds([...selectedIds, item.submission_id]);
                      else setSelectedIds(selectedIds.filter((x) => x !== item.submission_id));
                    }}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="font-medium">{item.student_name}</span>
                  <span className="text-text-secondary">({item.total_score}/{item.max_score})</span>
                </label>
              ))}
            </div>
          )}

          {/* Format Selection */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              Document Format:
            </label>
            <div className="flex items-center gap-4 text-xs font-medium text-text-primary">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={selectedFormat === "pdf"}
                  onChange={() => setSelectedFormat("pdf")}
                  className="text-accent focus:ring-accent"
                />
                <span>PDF Reports (Styled)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value="docx"
                  checked={selectedFormat === "docx"}
                  onChange={() => setSelectedFormat("docx")}
                  className="text-accent focus:ring-accent"
                />
                <span>Word Documents (.docx)</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="primary"
              icon={<FileArchive className="w-4 h-4" />}
              onClick={() =>
                exportMutation.mutate(selectedFormat === "pdf" ? "bulk_zip_pdf" : "bulk_zip_docx")
              }
              disabled={exportMutation.isPending || evaluatedItems.length === 0}
            >
              {exportMutation.isPending ? "Generating ZIP..." : "Download Selected as ZIP"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Section 2: Summary Spreadsheet Export */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            2. Gradebook Summary Export
          </h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-text-secondary">
            Contains all student names, scores, criteria breakdown, percentage, grade, and feedback in a single spreadsheet.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              icon={<FileSpreadsheet className="w-4 h-4 text-status-success" />}
              onClick={() => exportMutation.mutate("excel_summary")}
              disabled={exportMutation.isPending || evaluatedItems.length === 0}
            >
              Download Excel (.xlsx)
            </Button>
            <Button
              variant="secondary"
              icon={<FileText className="w-4 h-4 text-text-secondary" />}
              onClick={() => exportMutation.mutate("csv_summary")}
              disabled={exportMutation.isPending || evaluatedItems.length === 0}
            >
              Download CSV (.csv)
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Section 3: Export History */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            3. Export History
          </h2>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-background text-text-secondary uppercase">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Files Included</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!exportHistory || exportHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-text-tertiary">
                    No export history found.
                  </td>
                </tr>
              ) : (
                exportHistory.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-5 py-3 text-text-primary">
                      {format(new Date(rec.created_at), "MMM d, yyyy h:mm a")}
                    </td>
                    <td className="px-5 py-3 font-medium capitalize text-text-primary">
                      {rec.export_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {rec.submission_count || 1} submissions
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={rec.download_url}
                        className="inline-flex items-center gap-1 text-accent font-medium hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
