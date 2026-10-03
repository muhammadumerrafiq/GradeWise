import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Play,
  FileText,
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Trash2,
  Edit2,
  FileCheck,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import {
  getAssignment,
  listSubmissions,
  uploadSubmissions,
  deleteSubmission,
  deleteAssignment,
  startBatchEvaluation,
} from "../api";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { format } from "date-fns";

export const AssignmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const { data: assignment, isLoading: loadingAssignment } = useQuery({
    queryKey: ["assignment", id],
    queryFn: () => getAssignment(id!),
    enabled: !!id,
  });

  const { data: submissions, isLoading: loadingSubmissions } = useQuery({
    queryKey: ["submissions", id],
    queryFn: () => listSubmissions(id!),
    enabled: !!id,
  });

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const onDrop = (acceptedFiles: File[]) => {
    setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "text/plain": [".txt"],
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv"],
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => uploadSubmissions(id!, files),
    onSuccess: (data) => {
      showToast(`Uploaded ${data.length} submissions successfully!`, "success");
      setSelectedFiles([]);
      queryClient.invalidateQueries({ queryKey: ["submissions", id] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to upload submissions", "error");
    },
  });

  const deleteSubMutation = useMutation({
    mutationFn: (subId: string) => deleteSubmission(subId),
    onSuccess: () => {
      showToast("Submission removed", "info");
      queryClient.invalidateQueries({ queryKey: ["submissions", id] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => deleteAssignment(id!, true),
    onSuccess: () => {
      showToast("Assignment archived", "success");
      navigate("/assignments");
    },
  });

  const startEvalMutation = useMutation({
    mutationFn: () => startBatchEvaluation(id!),
    onSuccess: () => {
      navigate(`/assignments/${id}/processing`);
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to start evaluation", "error");
    },
  });

  const flaggedCount = submissions?.filter((s) => s.name_flagged).length || 0;
  const readyCount =
    submissions?.filter(
      (s) => !s.name_flagged && ["pending", "failed", "review_needed"].includes(s.status)
    ).length || 0;

  if (loadingAssignment) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!assignment) {
    return <div className="text-center py-12">Assignment not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text-primary">{assignment.title}</h1>
            <Badge variant={assignment.status === "active" ? "success" : "default"}>
              {assignment.status}
            </Badge>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Type: <span className="capitalize font-medium text-text-primary">{assignment.type}</span> ·
            Total Marks: <span className="font-medium text-text-primary">{assignment.total_marks}</span> ·
            Created: {assignment.created_at ? format(new Date(assignment.created_at), "MMM d, yyyy") : "-"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {submissions && submissions.some((s) => s.status === "evaluated" || s.status === "approved") && (
            <Button
              variant="secondary"
              icon={<FileCheck className="w-4 h-4" />}
              onClick={() => navigate(`/assignments/${id}/results`)}
            >
              View Results
            </Button>
          )}

          <Button
            variant="ghost"
            icon={<Archive className="w-4 h-4" />}
            onClick={() => archiveMutation.mutate()}
            title="Archive Assignment"
          >
            Archive
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-6">
        {[
          { key: "overview", label: "Overview" },
          { key: "submissions", label: `Submissions (${submissions?.length || 0})` },
          { key: "results", label: "Results" },
          { key: "export", label: "Export" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              if (tab.key === "results") navigate(`/assignments/${id}/results`);
              else if (tab.key === "export") navigate(`/assignments/${id}/export`);
              else setActiveTab(tab.key);
            }}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Instructions */}
          <Card>
            <CardHeader>
              <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Instructions & Prompt
              </h2>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                {assignment.instructions || "No specific instructions provided."}
              </p>
              {assignment.grading_notes && (
                <div className="mt-4 p-3 bg-background border border-border rounded text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">Grading Notes for AI: </span>
                  {assignment.grading_notes}
                </div>
              )}
              {assignment.feedback_instructions && (
                <div className="mt-4 p-3 bg-blue-50/40 border border-blue-100 rounded text-xs">
                  <span className="font-semibold text-accent block mb-1">Feedback Writing Instructions for AI:</span>
                  <p className="whitespace-pre-wrap text-text-secondary leading-relaxed">{assignment.feedback_instructions}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Requirements */}
          <Card>
            <CardHeader>
              <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Checklist Requirements
              </h2>
            </CardHeader>
            <CardBody>
              {assignment.requirements && assignment.requirements.length > 0 ? (
                <ul className="space-y-2 text-sm text-text-primary">
                  {assignment.requirements.map((r, idx) => (
                    <li key={r.id || idx} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-accent">✓</span>
                      <span>{r.description}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-secondary">No checklist requirements added.</p>
              )}
            </CardBody>
          </Card>

          {/* Rubric Breakdown */}
          <Card>
            <CardHeader className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Rubric Criteria
              </h2>
              <span className="text-xs font-bold text-text-primary">
                Total: {assignment.total_marks} marks
              </span>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-background text-text-secondary text-xs uppercase font-medium">
                    <th className="px-5 py-2.5">Criterion</th>
                    <th className="px-5 py-2.5">Max Marks</th>
                    <th className="px-5 py-2.5">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assignment.rubric_criteria?.map((c) => (
                    <tr key={c.id}>
                      <td className="px-5 py-3 font-medium text-text-primary">{c.name}</td>
                      <td className="px-5 py-3 font-semibold text-accent">{c.max_marks}</td>
                      <td className="px-5 py-3 text-text-secondary text-xs">{c.description || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: SUBMISSIONS */}
      {activeTab === "submissions" && (
        <div className="space-y-6">
          {/* Flagged Names Banner (if any) */}
          {flaggedCount > 0 && (
            <div className="p-4 bg-status-warning-bg border border-amber-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-status-warning flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {flaggedCount} student {flaggedCount === 1 ? "name needs" : "names need"} review
                  </p>
                  <p className="text-xs text-text-secondary">
                    Review and confirm student names before starting the evaluation batch.
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/assignments/${id}/name-mapping`)}
              >
                Review Names
              </Button>
            </div>
          )}

          {/* Upload Dropzone */}
          <Card>
            <div
              {...getRootProps()}
              className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-accent bg-accent-light"
                  : "border-border hover:border-gray-400 bg-background"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
              <p className="text-sm font-semibold text-text-primary mb-1">
                Drop your ZIP or CSV file here, or individual student documents
              </p>
              <p className="text-xs text-text-secondary">
                Accepted: .zip, .csv, .pdf, .docx, .txt (ZIP up to 200MB, CSV up to 50MB, documents up to 10MB)
              </p>
            </div>

            {selectedFiles.length > 0 && (
              <div className="p-4 bg-surface border-t border-border flex items-center justify-between">
                <span className="text-xs font-medium text-text-primary">
                  {selectedFiles.length} file(s) selected for upload
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFiles([])}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => uploadMutation.mutate(selectedFiles)}
                    disabled={uploadMutation.isPending}
                  >
                    {uploadMutation.isPending ? "Uploading & Extracting..." : "Upload Files"}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Action Bar for Submissions */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">
              Total uploaded: {submissions?.length || 0} submissions
            </span>

            <div className="flex items-center gap-3">
              {flaggedCount > 0 ? (
                <Button
                  variant="primary"
                  icon={<AlertTriangle className="w-4 h-4" />}
                  onClick={() => navigate(`/assignments/${id}/name-mapping`)}
                >
                  Resolve Names ({flaggedCount})
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<Play className="w-4 h-4" />}
                  onClick={() => startEvalMutation.mutate()}
                  disabled={readyCount === 0 || startEvalMutation.isPending}
                >
                  {startEvalMutation.isPending ? "Starting..." : `Start Evaluation (${readyCount})`}
                </Button>
              )}
            </div>
          </div>

          {/* Submissions List Table */}
          <Card>
            {loadingSubmissions ? (
              <CardBody className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardBody>
            ) : !submissions || submissions.length === 0 ? (
              <CardBody className="text-center py-12">
                <FileText className="w-10 h-10 text-text-tertiary mx-auto mb-2" />
                <p className="text-sm font-medium text-text-primary mb-1">No submissions uploaded</p>
                <p className="text-xs text-text-secondary">
                  Drag and drop student submission files or a ZIP archive above.
                </p>
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background text-text-secondary text-xs uppercase font-medium">
                      <th className="px-5 py-3">Filename</th>
                      <th className="px-5 py-3">Student Name</th>
                      <th className="px-5 py-3">Confidence</th>
                      <th className="px-5 py-3">Words</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {submissions.map((sub) => {
                      const isFlagged = sub.name_flagged;
                      const confidencePct = Math.round((sub.name_confidence || 0) * 100);

                      return (
                        <tr
                          key={sub.id}
                          className={`hover:bg-[#F9FAFB] transition-colors ${
                            isFlagged ? "border-l-4 border-l-status-warning bg-amber-50/20" : ""
                          }`}
                        >
                          <td className="px-5 py-3 text-text-primary font-mono text-xs">
                            {sub.original_filename}
                          </td>
                          <td className="px-5 py-3 font-medium text-text-primary">
                            {sub.student?.name || sub.detected_name || "Unknown"}
                          </td>
                          <td className="px-5 py-3 text-xs">
                            <span
                              className={`font-medium ${
                                confidencePct >= 80
                                  ? "text-status-success"
                                  : confidencePct >= 50
                                  ? "text-status-warning"
                                  : "text-status-error"
                              }`}
                            >
                              {confidencePct}%
                            </span>
                          </td>
                          <td className="px-5 py-3 text-text-secondary text-xs">
                            {sub.word_count || 0}
                          </td>
                          <td className="px-5 py-3">
                            <Badge
                              variant={
                                sub.status === "approved"
                                  ? "approved"
                                  : sub.status === "evaluated"
                                  ? "reviewed"
                                  : sub.status === "review_needed" || sub.status === "name_pending"
                                  ? "warning"
                                  : sub.status === "failed" || sub.status === "extraction_failed"
                                  ? "error"
                                  : "default"
                              }
                            >
                              {sub.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {sub.status === "evaluated" || sub.status === "approved" ? (
                                <Link
                                  to={`/assignments/${id}/results`}
                                  className="text-xs text-accent hover:underline"
                                >
                                  View Result
                                </Link>
                              ) : (
                                <button
                                  onClick={() => deleteSubMutation.mutate(sub.id)}
                                  className="text-text-tertiary hover:text-status-error p-1 rounded"
                                  title="Delete submission"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
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
      )}
    </div>
  );
};
