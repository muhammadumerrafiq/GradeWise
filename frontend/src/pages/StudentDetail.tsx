import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Check,
  CheckCircle2,
  AlertCircle,
  Copy,
  Download,
  RotateCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getEvaluation,
  updateEvaluation,
  approveEvaluation,
  regenerateSubmission,
  getResults,
} from "../api";
import { Button } from "../components/ui/Button";
import { Badge, BadgeVariant } from "../components/ui/Badge";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { copyToClipboard } from "../utils/clipboard";
import { getApiUrl } from "../api/client";
import type { CriterionScore, EnglishSeverity } from "../types";

export const StudentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: evaluation, isLoading } = useQuery({
    queryKey: ["evaluation", id],
    queryFn: () => getEvaluation(id!),
    enabled: !!id,
  });

  const assignmentId = evaluation?.submission?.assignment_id;

  // Query sibling evaluations for [← Prev] [Next →] navigation
  const { data: siblingResults } = useQuery({
    queryKey: ["results", assignmentId],
    queryFn: () => getResults(assignmentId!),
    enabled: !!assignmentId,
  });

  // Local state for interactive editing
  const [isEditingScores, setIsEditingScores] = useState(false);
  const [editedScores, setEditedScores] = useState<Record<string, number>>({});
  const [feedbackText, setFeedbackText] = useState("");
  const [notesText, setNotesText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");
  const [showNotes, setShowNotes] = useState(false);
  const [openAnalysis, setOpenAnalysis] = useState<Record<string, boolean>>({
    grammar: true,
    vocabulary: false,
    tenses: false,
    mechanics: false,
    structure: false,
  });
  const [showRegenMenu, setShowRegenMenu] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Initialize fields on load
  useEffect(() => {
    if (evaluation) {
      setFeedbackText(evaluation.teacher_feedback || evaluation.ai_feedback || "");
      setNotesText(evaluation.teacher_notes || "");
      const scoresMap: Record<string, number> = {};
      evaluation.criterion_scores?.forEach((c) => {
        scoresMap[c.criterion_id] = c.score;
      });
      setEditedScores(scoresMap);
    }
  }, [evaluation]);

  // Debounced auto-save for feedback and notes (1.5s after last keystroke)
  const debounceTimerRef = useRef<any>(null);

  const autoSaveMutation = useMutation({
    mutationFn: (data: { teacher_feedback?: string; teacher_notes?: string }) =>
      updateEvaluation(id!, data),
    onSuccess: () => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["evaluation", id] });
    },
    onError: () => {
      setSaveStatus("saved");
      showToast("Auto-save failed", "error");
    },
  });

  const handleFeedbackChange = (newVal: string) => {
    setFeedbackText(newVal);
    setSaveStatus("saving");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      autoSaveMutation.mutate({ teacher_feedback: newVal });
    }, 1500);
  };

  const handleNotesChange = (newVal: string) => {
    setNotesText(newVal);
    setSaveStatus("saving");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      autoSaveMutation.mutate({ teacher_notes: newVal });
    }, 1500);
  };

  const saveScoresMutation = useMutation({
    mutationFn: () => {
      const criterionPayload = Object.entries(editedScores).map(([critId, score]) => ({
        criterion_id: critId,
        score: Number(score),
      }));
      return updateEvaluation(id!, { criterion_scores: criterionPayload });
    },
    onSuccess: () => {
      setIsEditingScores(false);
      showToast("Scores updated & recalculated!", "success");
      queryClient.invalidateQueries({ queryKey: ["evaluation", id] });
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to save scores", "error");
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => approveEvaluation(id!),
    onSuccess: () => {
      showToast("Evaluation Approved ✓", "success");
      queryClient.invalidateQueries({ queryKey: ["evaluation", id] });
    },
  });

  const regenMutation = useMutation({
    mutationFn: (type: "full" | "feedback") =>
      regenerateSubmission(evaluation!.submission_id, type),
    onSuccess: () => {
      setShowRegenMenu(false);
      showToast("Regeneration started...", "info");
      navigate(`/assignments/${assignmentId}/processing`);
    },
  });

  // Sibling Prev / Next Calculation
  const evaluatedSiblings = siblingResults?.items.filter((i) => i.evaluation_id) || [];
  const currentIndex = evaluatedSiblings.findIndex((i) => i.evaluation_id === id);
  const prevEval = currentIndex > 0 ? evaluatedSiblings[currentIndex - 1] : null;
  const nextEval =
    currentIndex >= 0 && currentIndex < evaluatedSiblings.length - 1
      ? evaluatedSiblings[currentIndex + 1]
      : null;

  // Copy Functions
  const copyScore = async () => {
    if (!evaluation) return;
    const text = `${evaluation.total_score}/${evaluation.max_score} (${evaluation.percentage.toFixed(1)}%) — ${evaluation.grade_label || ""}`;
    const success = await copyToClipboard(text);
    if (success) {
      showToast("Score copied to clipboard!", "success");
    } else {
      showToast("Failed to copy score", "error");
    }
  };

  const copyFeedback = async () => {
    const success = await copyToClipboard(feedbackText);
    if (success) {
      showToast("Feedback copied to clipboard!", "success");
    } else {
      showToast("Failed to copy feedback", "error");
    }
  };

  const copyFullResult = async () => {
    if (!evaluation) return;
    const studentName =
      evaluation.submission?.student?.name ||
      evaluation.submission?.detected_name ||
      "Student";
    const assignTitle = "English Assignment";

    let text = `Student: ${studentName}\nAssignment: ${assignTitle}\nScore: ${evaluation.total_score}/${evaluation.max_score} (${evaluation.percentage.toFixed(1)}%) | Grade: ${evaluation.grade_label || ""}\n\nRubric:\n`;

    evaluation.criterion_scores?.forEach((c) => {
      text += `${c.criterion_name}: ${c.score}/${c.max_score}\n`;
    });

    if (evaluation.requirements_result?.length) {
      text += `\nRequirements:\n`;
      evaluation.requirements_result.forEach((r) => {
        const mark = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "◐";
        text += `${mark} ${r.description} — ${r.detail}\n`;
      });
    }

    if (evaluation.strengths?.length) {
      text += `\nStrengths:\n`;
      evaluation.strengths.forEach((s) => {
        text += `• ${s}\n`;
      });
    }

    if (evaluation.improvements?.length) {
      text += `\nAreas for Improvement:\n`;
      evaluation.improvements.forEach((imp) => {
        text += `• ${imp}\n`;
      });
    }

    text += `\nFeedback:\n${feedbackText}\n`;

    const success = await copyToClipboard(text);
    if (success) {
      showToast("Full result copied to clipboard!", "success");
    } else {
      showToast("Failed to copy result", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-4 h-[700px]">
          <Skeleton className="h-full w-full" />
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return <div className="text-center py-12">Evaluation not found</div>;
  }

  const studentName =
    evaluation.submission?.student?.name ||
    evaluation.submission?.detected_name ||
    "Student";

  const isApproved = evaluation.eval_status === "approved";

  const getSeverityBadgeVariant = (sev: EnglishSeverity): BadgeVariant => {
    if (sev === "significant") return "error";
    if (sev === "moderate") return "warning";
    if (sev === "minor") return "info";
    return "default";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-border pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              assignmentId
                ? navigate(`/assignments/${assignmentId}/results`)
                : navigate(-1)
            }
            className="text-text-secondary hover:text-text-primary p-1.5 rounded hover:bg-surface transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-text-primary">{studentName}</h1>
              <span className="text-text-tertiary">·</span>
              <span className="text-sm font-semibold text-accent">
                {evaluation.total_score} / {evaluation.max_score} (
                {evaluation.percentage.toFixed(1)}%)
              </span>
              <span className="text-sm font-bold bg-accent-light text-accent px-2 py-0.5 rounded">
                {evaluation.grade_label}
              </span>
              <Badge
                variant={
                  isApproved
                    ? "approved"
                    : evaluation.eval_status === "reviewed"
                    ? "reviewed"
                    : "pending_review"
                }
              >
                {evaluation.eval_status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-xs text-text-secondary mt-0.5 font-mono">
              {evaluation.submission?.original_filename} · {evaluation.submission?.word_count || 0} words
            </p>
          </div>
        </div>

        {/* Prev / Next navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronLeft className="w-4 h-4" />}
            disabled={!prevEval}
            onClick={() => prevEval && navigate(`/evaluations/${prevEval.evaluation_id}`)}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!nextEval}
            onClick={() => nextEval && navigate(`/evaluations/${nextEval.evaluation_id}`)}
          >
            Next <ChevronRight className="w-4 h-4 ml-1 inline" />
          </Button>
        </div>
      </div>

      {/* Two-Panel Split Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 py-4 overflow-hidden">
        {/* LEFT PANEL: 45% (col-span-5) — Original Submission */}
        <div className="lg:col-span-5 flex flex-col h-full bg-surface border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-background border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Submission Text
            </span>
            <span className="text-xs text-text-secondary font-mono">
              {evaluation.submission?.word_count || 0} words
            </span>
          </div>
          <div className="flex-1 p-5 overflow-y-auto submission-reading text-text-primary whitespace-pre-wrap select-text leading-relaxed">
            {evaluation.submission?.extracted_text || "(No extracted text available for this submission)"}
          </div>
        </div>

        {/* RIGHT PANEL: 55% (col-span-7) — Evaluation, Rubrics, Feedback */}
        <div className="lg:col-span-7 flex flex-col h-full overflow-y-auto space-y-4 pr-1">
          {/* Score Breakdown Table */}
          <Card>
            <CardHeader className="flex justify-between items-center py-2.5">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Score Breakdown
              </span>
              <button
                onClick={() => {
                  if (isEditingScores) {
                    saveScoresMutation.mutate();
                  } else {
                    setIsEditingScores(true);
                  }
                }}
                className="text-xs font-medium text-accent hover:underline flex items-center gap-1"
              >
                {isEditingScores ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-status-success" /> Save Scores
                  </>
                ) : (
                  <>
                    <Edit2 className="w-3.5 h-3.5" /> Edit Scores
                  </>
                )}
              </button>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-background text-text-secondary">
                    <th className="px-4 py-2 font-medium">Criterion</th>
                    <th className="px-3 py-2 font-medium w-24">Score</th>
                    <th className="px-4 py-2 font-medium">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {evaluation.criterion_scores?.map((c) => {
                    const currentScore = isEditingScores
                      ? editedScores[c.criterion_id] ?? c.score
                      : c.score;

                    return (
                      <tr key={c.id} className="hover:bg-[#F9FAFB]">
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-text-primary block">
                            {c.criterion_name}
                          </span>
                          {c.rationale && (
                            <span className="text-[11px] text-text-secondary block mt-0.5">
                              {c.rationale}
                            </span>
                          )}
                          {c.evidence && (
                            <span className="text-[11px] text-accent italic block mt-0.5">
                              Quote: "{c.evidence}"
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-text-primary">
                          {isEditingScores ? (
                            <input
                              type="number"
                              min={0}
                              max={c.max_score}
                              value={currentScore}
                              onChange={(e) =>
                                setEditedScores({
                                  ...editedScores,
                                  [c.criterion_id]: parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-16 border border-border rounded px-1.5 py-0.5 bg-surface text-center font-bold"
                            />
                          ) : (
                            <span>
                              {c.score} / {c.max_score}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <ProgressBar value={currentScore} max={c.max_score} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-background font-bold text-text-primary">
                    <td className="px-4 py-2.5">Total Score</td>
                    <td className="px-3 py-2.5 text-accent text-sm" colSpan={2}>
                      {evaluation.total_score} / {evaluation.max_score} (
                      {evaluation.percentage.toFixed(1)}%)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Requirements Checklist */}
          {evaluation.requirements_result && evaluation.requirements_result.length > 0 && (
            <Card>
              <CardHeader className="py-2.5">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Checklist Requirements
                </span>
              </CardHeader>
              <CardBody className="p-3 space-y-2 text-xs">
                {evaluation.requirements_result.map((r, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <span
                      className={`text-xs font-bold mt-0.5 ${
                        r.status === "PASS"
                          ? "text-status-success"
                          : r.status === "FAIL"
                          ? "text-status-error"
                          : "text-status-warning"
                      }`}
                    >
                      {r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "◐"}
                    </span>
                    <div>
                      <span className="font-semibold text-text-primary">{r.description}</span>
                      <span className="text-text-secondary block mt-0.5">{r.detail}</span>
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* English Analysis Collapsible Sections */}
          {evaluation.english_analysis && (
            <Card>
              <CardHeader className="py-2.5">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  English Language Analysis
                </span>
              </CardHeader>
              <div className="divide-y divide-border">
                {Object.entries(evaluation.english_analysis).map(([cat, info]: any) => {
                  const isOpen = !!openAnalysis[cat];
                  return (
                    <div key={cat} className="p-3 text-xs">
                      <div
                        onClick={() =>
                          setOpenAnalysis({ ...openAnalysis, [cat]: !isOpen })
                        }
                        className="flex items-center justify-between cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold capitalize text-text-primary">
                            {cat}
                          </span>
                          <Badge variant={getSeverityBadgeVariant(info.severity)}>
                            {info.severity}
                          </Badge>
                        </div>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />}
                      </div>

                      {isOpen && (
                        <div className="mt-2 text-text-secondary pl-2 border-l-2 border-border space-y-1">
                          <p className="text-text-primary">{info.summary}</p>
                          {info.issues && info.issues.length > 0 && (
                            <ul className="list-disc list-inside space-y-0.5 text-text-secondary pt-1">
                              {info.issues.map((iss: string, i: number) => (
                                <li key={i}>{iss}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <Card>
              <CardHeader className="py-2.5 bg-status-success-bg/40">
                <span className="font-bold text-status-success uppercase tracking-wider">
                  Strengths
                </span>
              </CardHeader>
              <CardBody className="p-3">
                <ul className="space-y-1.5 list-disc list-inside text-text-primary">
                  {evaluation.strengths?.map((s, idx) => (
                    <li key={idx} className="leading-snug">{s}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="py-2.5 bg-status-warning-bg/40">
                <span className="font-bold text-status-warning uppercase tracking-wider">
                  Areas For Improvement
                </span>
              </CardHeader>
              <CardBody className="p-3">
                <ul className="space-y-1.5 list-disc list-inside text-text-primary">
                  {evaluation.improvements?.map((imp, idx) => (
                    <li key={idx} className="leading-snug">{imp}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          {/* Teacher Feedback (Editable with Auto-save) */}
          <Card>
            <CardHeader className="py-2.5 flex justify-between items-center">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Teacher Feedback
              </span>
              <span
                className={`text-xs font-medium ${
                  saveStatus === "saving" ? "text-accent animate-pulse" : "text-status-success"
                }`}
              >
                {saveStatus === "saving" ? "Saving..." : "Saved ✓"}
              </span>
            </CardHeader>
            <CardBody className="p-3">
              <textarea
                value={feedbackText}
                onChange={(e) => handleFeedbackChange(e.target.value)}
                rows={5}
                className="w-full text-sm bg-surface border border-border rounded p-3 text-text-primary leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Write customized teacher feedback..."
              />
            </CardBody>
          </Card>

          {/* Teacher Private Notes */}
          <Card>
            <CardHeader
              onClick={() => setShowNotes(!showNotes)}
              className="py-2.5 cursor-pointer flex justify-between items-center hover:bg-background"
            >
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Teacher Notes (Private, Not Exported)
              </span>
              {showNotes ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </CardHeader>
            {showNotes && (
              <CardBody className="p-3">
                <textarea
                  value={notesText}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  rows={2}
                  className="w-full text-xs bg-background border border-border rounded p-2 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Private observations or reference notes..."
                />
              </CardBody>
            )}
          </Card>
        </div>
      </div>

      {/* FIXED BOTTOM ACTION BAR */}
      <div className="bg-surface border-t border-border px-6 py-3 flex items-center justify-between flex-shrink-0 -mx-6 md:-mx-8">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="xs" onClick={copyScore}>
            Copy Score
          </Button>
          <Button variant="secondary" size="xs" onClick={copyFeedback}>
            Copy Feedback
          </Button>
          <Button variant="secondary" size="xs" onClick={copyFullResult}>
            Copy Full Result
          </Button>
        </div>

        <div className="flex items-center gap-2 relative">
          {/* Regenerate Dropdown */}
          <div className="relative">
            <Button
              variant="secondary"
              size="xs"
              icon={<RotateCw className="w-3.5 h-3.5" />}
              onClick={() => setShowRegenMenu(!showRegenMenu)}
            >
              Regenerate ▼
            </Button>
            {showRegenMenu && (
              <div className="absolute right-0 bottom-full mb-1 w-44 bg-surface border border-border rounded-lg shadow-lg py-1 z-30 text-xs">
                <button
                  onClick={() => regenMutation.mutate("feedback")}
                  className="w-full text-left px-3 py-2 hover:bg-background text-text-primary"
                >
                  Regenerate Feedback
                </button>
                <button
                  onClick={() => regenMutation.mutate("full")}
                  className="w-full text-left px-3 py-2 hover:bg-background text-text-primary"
                >
                  Regenerate Full Evaluation
                </button>
              </div>
            )}
          </div>

          {/* Download Dropdown */}
          <div className="relative">
            <Button
              variant="secondary"
              size="xs"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
            >
              Download ▼
            </Button>
            {showDownloadMenu && (
              <div className="absolute right-0 bottom-full mb-1 w-32 bg-surface border border-border rounded-lg shadow-lg py-1 z-30 text-xs">
                <button
                  onClick={() => {
                    setShowDownloadMenu(false);
                    window.location.href = getApiUrl(`/api/export/single/${evaluation.submission_id}/pdf`);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-background text-text-primary"
                >
                  PDF Report
                </button>
                <button
                  onClick={() => {
                    setShowDownloadMenu(false);
                    window.location.href = getApiUrl(`/api/export/single/${evaluation.submission_id}/docx`);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-background text-text-primary"
                >
                  Word DOCX
                </button>
              </div>
            )}
          </div>

          {/* Approve Button */}
          <Button
            variant={isApproved ? "success" : "primary"}
            size="sm"
            icon={<CheckCircle2 className="w-4 h-4" />}
            onClick={() => approveMutation.mutate()}
            disabled={isApproved || approveMutation.isPending}
          >
            {isApproved ? "Approved ✓" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
};
