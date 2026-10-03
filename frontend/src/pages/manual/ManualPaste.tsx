import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Settings2,
  FileDown,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Save,
  Clock,
  BookOpen,
} from "lucide-react";
import { manualApi } from "../../api/manualApi";
import type {
  AssignmentType,
  ManualEvaluation,
  ManualRequirementItem,
  ManualSession,
} from "../../types";
import { useToast } from "../../components/ui/Toast";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { copyToClipboard } from "../../utils/clipboard";

const ASSIGNMENT_TYPES: { value: AssignmentType; label: string }[] = [
  { value: "essay", label: "Essay" },
  { value: "narrative", label: "Narrative" },
  { value: "descriptive", label: "Descriptive" },
  { value: "paragraph", label: "Paragraph" },
  { value: "letter", label: "Letter" },
  { value: "report", label: "Report" },
  { value: "creative", label: "Creative" },
  { value: "general", label: "General" },
  { value: "custom", label: "Custom" },
];

export const ManualPaste: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const sessionIdParam = searchParams.get("session_id");

  // Session state
  const [activeSession, setActiveSession] = useState<ManualSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Setup form state
  const [setupTitle, setSetupTitle] = useState("");
  const [setupType, setSetupType] = useState<AssignmentType>("general");
  const [setupInstructions, setSetupInstructions] = useState("");
  const [setupRequirements, setSetupRequirements] = useState<ManualRequirementItem[]>([]);
  const [setupFeedbackInstructions, setSetupFeedbackInstructions] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  // Input area state
  const [studentName, setStudentName] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [evaluating, setEvaluating] = useState(false);

  // Output area state
  const [currentEval, setCurrentEval] = useState<ManualEvaluation | null>(null);
  const [editableFeedback, setEditableFeedback] = useState("");
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);

  // History state
  const [showHistory, setShowHistory] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedHistoryEval, setSelectedHistoryEval] = useState<ManualEvaluation | null>(null);

  const studentNameInputRef = useRef<HTMLInputElement>(null);

  // Load session from parameter or fetch recent active session
  useEffect(() => {
    const initSession = async () => {
      setLoadingSession(true);
      try {
        if (sessionIdParam) {
          const s = await manualApi.getSession(sessionIdParam);
          setActiveSession(s);
          populateSetupForm(s);
        } else {
          // Check if there are any existing sessions
          const sessions = await manualApi.listSessions();
          if (sessions.length > 0) {
            const latest = await manualApi.getSession(sessions[0].id);
            setActiveSession(latest);
            setSearchParams({ session_id: latest.id });
            populateSetupForm(latest);
          } else {
            // No sessions exist yet, open setup
            setShowSetupModal(true);
          }
        }
      } catch (err: any) {
        showToast(err.message || "Failed to load session", "error");
        setShowSetupModal(true);
      } finally {
        setLoadingSession(false);
      }
    };

    initSession();
  }, [sessionIdParam]);

  const populateSetupForm = (s: ManualSession) => {
    setSetupTitle(s.title);
    setSetupType(s.assignment_type);
    setSetupInstructions(s.instructions || "");
    setSetupRequirements(s.requirements ? [...s.requirements] : []);
    setSetupFeedbackInstructions(s.feedback_instructions || "");
  };

  // Word & character counts
  const wordCount = useMemo(() => {
    const tokens = submissionText.trim().split(/\s+/);
    return tokens.filter((t) => t.length > 0).length;
  }, [submissionText]);

  const charCount = submissionText.length;

  const feedbackWordCount = useMemo(() => {
    const tokens = editableFeedback.trim().split(/\s+/);
    return tokens.filter((t) => t.length > 0).length;
  }, [editableFeedback]);

  // Handle Save Session Settings
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!setupTitle.trim()) {
      showToast("Assignment title is required", "error");
      return;
    }
    if (!setupFeedbackInstructions.trim()) {
      showToast("Feedback instructions are required", "error");
      return;
    }

    setSavingSettings(true);
    try {
      if (activeSession && !showSetupModal) {
        // Update existing session
        const updated = await manualApi.updateSession(activeSession.id, {
          title: setupTitle.trim(),
          assignment_type: setupType,
          instructions: setupInstructions.trim(),
          requirements: setupRequirements.filter((r) => r.description.trim().length > 0),
          feedback_instructions: setupFeedbackInstructions.trim(),
        });
        setActiveSession((prev) => (prev ? { ...prev, ...updated } : updated));
        showToast("Session settings updated", "success");
        setShowSetupModal(false);
      } else {
        // Create new session
        const created = await manualApi.createSession({
          title: setupTitle.trim(),
          assignment_type: setupType,
          instructions: setupInstructions.trim(),
          requirements: setupRequirements.filter((r) => r.description.trim().length > 0),
          feedback_instructions: setupFeedbackInstructions.trim(),
        });
        setActiveSession(created);
        setSearchParams({ session_id: created.id });
        showToast("New session started", "success");
        setShowSetupModal(false);
        // Focus student name input
        setTimeout(() => studentNameInputRef.current?.focus(), 100);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to save settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Requirement row helpers
  const handleAddRequirement = () => {
    setSetupRequirements([...setupRequirements, { description: "" }]);
  };

  const handleUpdateRequirement = (index: number, text: string) => {
    const updated = [...setupRequirements];
    updated[index].description = text;
    setSetupRequirements(updated);
  };

  const handleRemoveRequirement = (index: number) => {
    setSetupRequirements(setupRequirements.filter((_, i) => i !== index));
  };

  // Evaluate single submission
  const handleEvaluate = async () => {
    if (!activeSession) {
      showToast("Please save session settings first", "error");
      setShowSetupModal(true);
      return;
    }
    if (!studentName.trim()) {
      showToast("Please enter the student's name", "error");
      studentNameInputRef.current?.focus();
      return;
    }
    if (!submissionText.trim()) {
      showToast("Please paste the student's assignment text", "error");
      return;
    }

    setEvaluating(true);
    try {
      const result = await manualApi.evaluateSubmission(activeSession.id, {
        student_name: studentName.trim(),
        submission_text: submissionText.trim(),
      });
      setCurrentEval(result);
      setEditableFeedback(result.teacher_feedback || "");

      // Refresh session history in background
      manualApi.getSession(activeSession.id).then((fresh) => {
        setActiveSession(fresh);
      });

      showToast(`Evaluated ${result.student_name} successfully`, "success");
    } catch (err: any) {
      showToast(err.message || "Evaluation failed. Please try again.", "error");
    } finally {
      setEvaluating(false);
    }
  };

  // Keyboard shortcut: Ctrl+Enter or Cmd+Enter to evaluate
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleEvaluate();
    }
  };

  // Copy Feedback ONLY (clean text ready for portal)
  const handleCopyFeedback = async (textToCopy?: string) => {
    const text = textToCopy !== undefined ? textToCopy : editableFeedback;
    if (!text) return;
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedFeedback(true);
      showToast("Feedback copied to clipboard!", "success");
      setTimeout(() => setCopiedFeedback(false), 2000);
    } else {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  // Copy Full Summary
  const handleCopyFullSummary = async () => {
    if (!currentEval) return;
    let full = `STUDENT: ${currentEval.student_name}\nWORD COUNT: ${currentEval.word_count} words\n\n`;

    if (currentEval.requirements_result && currentEval.requirements_result.length > 0) {
      full += "REQUIREMENTS CHECK:\n";
      currentEval.requirements_result.forEach((r) => {
        full += `- [${r.status}] ${r.description}${r.detail ? `: ${r.detail}` : ""}\n`;
      });
      full += "\n";
    }

    if (currentEval.writing_quality_summary) {
      full += `WRITING QUALITY SUMMARY:\n${currentEval.writing_quality_summary}\n\n`;
    }

    if (currentEval.strengths && currentEval.strengths.length > 0) {
      full += "STRENGTHS:\n";
      currentEval.strengths.forEach((s) => (full += `• ${s}\n`));
      full += "\n";
    }

    if (currentEval.improvements && currentEval.improvements.length > 0) {
      full += "AREAS FOR IMPROVEMENT:\n";
      currentEval.improvements.forEach((i) => (full += `• ${i}\n`));
      full += "\n";
    }

    full += `TEACHER FEEDBACK:\n${editableFeedback}\n`;

    const success = await copyToClipboard(full);
    if (success) {
      setCopiedFull(true);
      showToast("Full summary copied!", "success");
      setTimeout(() => setCopiedFull(false), 2000);
    } else {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  // Clear & Next: Clears left input and right output, ready for next student
  const handleClearAndNext = () => {
    setStudentName("");
    setSubmissionText("");
    setCurrentEval(null);
    setEditableFeedback("");
    setCopiedFeedback(false);
    setCopiedFull(false);
    setTimeout(() => studentNameInputRef.current?.focus(), 50);
  };

  // Save manual feedback edits
  const handleSaveFeedbackEdits = async () => {
    if (!currentEval) return;
    setSavingFeedback(true);
    try {
      const updated = await manualApi.updateEvaluation(currentEval.id, {
        teacher_feedback: editableFeedback,
      });
      setCurrentEval(updated);
      showToast("Feedback updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update feedback", "error");
    } finally {
      setSavingFeedback(false);
    }
  };

  // Delete evaluation from history
  const handleDeleteEval = async (evalId: string) => {
    try {
      await manualApi.deleteEvaluation(evalId);
      if (currentEval?.id === evalId) {
        handleClearAndNext();
      }
      if (activeSession) {
        const fresh = await manualApi.getSession(activeSession.id);
        setActiveSession(fresh);
      }
      showToast("Evaluation deleted", "info");
    } catch (err: any) {
      showToast(err.message || "Failed to delete evaluation", "error");
    }
  };

  // Clear full session
  const handleClearSession = async () => {
    if (!activeSession) return;
    try {
      await manualApi.deleteSession(activeSession.id);
      setActiveSession(null);
      setSearchParams({});
      handleClearAndNext();
      setShowClearConfirm(false);
      setShowSetupModal(true);
      showToast("Session cleared", "info");
    } catch (err: any) {
      showToast(err.message || "Failed to clear session", "error");
    }
  };

  // Export current session
  const handleExport = async (format: "csv" | "pdf" | "docx") => {
    if (!activeSession) return;
    try {
      await manualApi.downloadExport(
        activeSession.id,
        format,
        `${activeSession.title.replace(/[\s\W]+/g, "_")}_evaluations.${format}`
      );
      showToast(`Exported ${format.toUpperCase()} successfully`, "success");
    } catch (err: any) {
      showToast(err.message || "Export failed", "error");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Session Active Header Banner */}
      {activeSession ? (
        <div className="bg-surface border border-border rounded-xl p-4 md:p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Session
                </span>
                <Badge variant="default" className="uppercase font-medium tracking-wide">
                  {activeSession.assignment_type}
                </Badge>
                <h1 className="text-lg md:text-xl font-bold text-text-primary tracking-tight">
                  {activeSession.title}
                </h1>
              </div>

              {/* Compact Settings Overview */}
              <div className="text-xs text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                {activeSession.requirements && activeSession.requirements.length > 0 && (
                  <span>
                    <strong className="text-text-primary">Requirements:</strong>{" "}
                    {activeSession.requirements.map((r) => r.description).join(" · ")}
                  </span>
                )}
                {activeSession.feedback_instructions && (
                  <span className="truncate max-w-xl">
                    <strong className="text-text-primary">Feedback Style:</strong>{" "}
                    {activeSession.feedback_instructions}
                  </span>
                )}
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  populateSetupForm(activeSession);
                  setShowSetupModal(true);
                }}
                className="text-xs flex items-center gap-1.5"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Edit Settings
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSetupTitle("");
                  setSetupType("general");
                  setSetupInstructions("");
                  setSetupRequirements([]);
                  setSetupFeedbackInstructions("");
                  setShowSetupModal(true);
                }}
                className="text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                New Session
              </Button>

              {activeSession.evaluations && activeSession.evaluations.length > 0 && (
                <div className="relative group">
                  <Button variant="secondary" size="sm" className="text-xs flex items-center gap-1.5">
                    <FileDown className="w-3.5 h-3.5" />
                    Export
                    <ChevronDown className="w-3 h-3 text-text-tertiary" />
                  </Button>
                  <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-lg shadow-lg py-1.5 hidden group-hover:block z-30">
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-background flex items-center justify-between"
                    >
                      <span>Download CSV</span>
                      <span className="text-[10px] text-text-tertiary">.csv</span>
                    </button>
                    <button
                      onClick={() => handleExport("docx")}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-background flex items-center justify-between"
                    >
                      <span>Download Word</span>
                      <span className="text-[10px] text-text-tertiary">.docx</span>
                    </button>
                    <button
                      onClick={() => handleExport("pdf")}
                      className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-background flex items-center justify-between"
                    >
                      <span>Download PDF</span>
                      <span className="text-[10px] text-text-tertiary">.pdf</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Main Two-Column Working Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN: Input Area */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <span>Student Name</span>
                <span className="text-status-error">*</span>
              </label>
              {studentName.trim() && (
                <span className="text-[11px] text-emerald-600 font-medium">Ready</span>
              )}
            </div>
            <input
              ref={studentNameInputRef}
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Enter the student's name before pasting their assignment"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all placeholder:text-text-tertiary"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <span>Submission Text</span>
                <span className="text-status-error">*</span>
              </label>
              <div className="text-xs text-text-tertiary font-mono">
                {wordCount} words · {charCount} chars
              </div>
            </div>
            <textarea
              value={submissionText}
              onChange={(e) => setSubmissionText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Copy the student's submission from the portal and paste it here..."
              rows={16}
              className="w-full px-3.5 py-3 rounded-lg border border-border bg-background text-text-primary text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all placeholder:text-text-tertiary resize-y"
            />
          </div>

          <div className="space-y-2 pt-1">
            <Button
              variant="primary"
              size="lg"
              onClick={handleEvaluate}
              disabled={evaluating || !studentName.trim() || !submissionText.trim()}
              className="w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
            >
              {evaluating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Evaluating Submission...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Evaluate This Submission</span>
                  <span className="text-xs text-white/70 font-normal ml-1">(Ctrl+Enter)</span>
                </>
              )}
            </Button>

            <p className="text-[11px] text-text-tertiary text-center leading-normal">
              Each submission is evaluated independently. Pasting multiple students together will mix their work.
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: Output Area */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm min-h-[580px] flex flex-col justify-between">
          {evaluating ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center animate-pulse">
                <Sparkles className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Evaluating {studentName}'s Writing...
                </h3>
                <p className="text-xs text-text-secondary mt-1 max-w-sm">
                  Checking requirements, analyzing writing structure, and applying your custom feedback instructions.
                </p>
              </div>
            </div>
          ) : currentEval ? (
            <div className="space-y-5">
              {/* TOP ACTION BAR — PROMINENT COPY BUTTON AT TOP */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleCopyFeedback()}
                  className={`flex items-center gap-2 font-semibold text-sm transition-all duration-200 ${
                    copiedFeedback ? "!bg-emerald-600 hover:!bg-emerald-700" : "!bg-accent hover:!bg-accent-hover"
                  }`}
                >
                  {copiedFeedback ? (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Feedback</span>
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyFullSummary}
                    className="text-xs flex items-center gap-1.5 bg-white hover:bg-slate-50"
                  >
                    {copiedFull ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>Copy Full Summary</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAndNext}
                    className="text-xs flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
                    title="Clear input and output to grade next student"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear & Next</span>
                  </Button>
                </div>
              </div>

              {/* Student Header */}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    {currentEval.student_name}
                  </h3>
                  <p className="text-xs text-text-tertiary">
                    {currentEval.word_count} words · Evaluated just now
                  </p>
                </div>
                <Badge variant="success">Complete</Badge>
              </div>

              {/* Requirements Check Section */}
              {currentEval.requirements_result && currentEval.requirements_result.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Requirements Check
                  </div>
                  <div className="space-y-1.5">
                    {currentEval.requirements_result.map((req, i) => {
                      const isPass = req.status === "PASS";
                      const isPartial = req.status === "PARTIAL";
                      return (
                        <div
                          key={i}
                          className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                            isPass
                              ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                              : isPartial
                              ? "bg-amber-50/60 border-amber-200 text-amber-900"
                              : "bg-red-50/60 border-red-200 text-red-900"
                          }`}
                        >
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider flex-shrink-0 ${
                              isPass
                                ? "bg-emerald-200 text-emerald-900"
                                : isPartial
                                ? "bg-amber-200 text-amber-900"
                                : "bg-red-200 text-red-900"
                            }`}
                          >
                            {req.status}
                          </span>
                          <div className="flex-1">
                            <span className="font-semibold">{req.description}: </span>
                            <span className="opacity-90">{req.detail}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Writing Quality Summary */}
              {currentEval.writing_quality_summary && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Writing Quality Summary
                  </div>
                  <p className="text-xs text-text-primary leading-relaxed bg-background p-3 rounded-lg border border-border">
                    {currentEval.writing_quality_summary}
                  </p>
                </div>
              )}

              {/* Strengths & Improvements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentEval.strengths && currentEval.strengths.length > 0 && (
                  <div className="p-3 rounded-lg bg-background border border-border space-y-1.5">
                    <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Strengths
                    </div>
                    <ul className="text-xs text-text-primary space-y-1 list-disc list-inside">
                      {currentEval.strengths.map((s, idx) => (
                        <li key={idx} className="leading-snug">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {currentEval.improvements && currentEval.improvements.length > 0 && (
                  <div className="p-3 rounded-lg bg-background border border-border space-y-1.5">
                    <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      Areas for Improvement
                    </div>
                    <ul className="text-xs text-text-primary space-y-1 list-disc list-inside">
                      {currentEval.improvements.map((imp, idx) => (
                        <li key={idx} className="leading-snug">
                          {imp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Teacher Feedback Main Box */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                    <span>Teacher Feedback</span>
                    <span className="text-[10px] font-normal text-text-tertiary">
                      (Follows your instructions · Editable)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-text-tertiary font-mono">
                      {feedbackWordCount} words
                    </span>
                    {editableFeedback !== currentEval.teacher_feedback && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSaveFeedbackEdits}
                        disabled={savingFeedback}
                        className="text-[11px] py-0.5 px-2 h-6 flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        <span>Save Edits</span>
                      </Button>
                    )}
                  </div>
                </div>

                <textarea
                  value={editableFeedback}
                  onChange={(e) => setEditableFeedback(e.target.value)}
                  rows={6}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-accent/40 bg-accent-light/10 text-text-primary text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-24 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">
                Evaluated feedback will appear here
              </h3>
              <p className="text-xs text-text-secondary max-w-xs">
                Enter student name on the left, paste their writing, and click Evaluate to generate structured feedback.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PART C: SESSION HISTORY */}
      {activeSession && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm mt-8">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-accent transition-colors"
              >
                <span>Session History</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent-light text-accent">
                  {activeSession.evaluations?.length || 0} evaluated
                </span>
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {activeSession.evaluations && activeSession.evaluations.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowClearConfirm(true)}
                    className="text-xs text-status-error hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Session
                  </Button>
                </>
              )}
            </div>
          </div>

          {showHistory && (
            <div className="p-0">
              {activeSession.evaluations && activeSession.evaluations.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-background border-b border-border text-text-secondary uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Time</th>
                        <th className="py-3 px-4">Requirements</th>
                        <th className="py-3 px-4">Feedback Preview</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activeSession.evaluations.map((ev) => {
                        const passCount =
                          ev.requirements_result?.filter((r) => r.status === "PASS").length || 0;
                        const totalReqs = ev.requirements_result?.length || 0;

                        return (
                          <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-semibold text-text-primary">
                              {ev.student_name}
                              <div className="text-[11px] font-normal text-text-tertiary">
                                {ev.word_count} words
                              </div>
                            </td>
                            <td className="py-3 px-4 text-text-secondary whitespace-nowrap">
                              {new Date(ev.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="py-3 px-4">
                              {totalReqs > 0 ? (
                                <Badge
                                  variant={
                                    passCount === totalReqs
                                      ? "success"
                                      : passCount > 0
                                      ? "warning"
                                      : "error"
                                  }
                                >
                                  {passCount}/{totalReqs} Passed
                                </Badge>
                              ) : (
                                <span className="text-text-tertiary">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 max-w-md truncate text-text-secondary">
                              {ev.teacher_feedback || "No feedback"}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setCurrentEval(ev);
                                    setStudentName(ev.student_name);
                                    setSubmissionText(ev.submission_text);
                                    setEditableFeedback(ev.teacher_feedback || "");
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }}
                                  className="text-xs px-2 h-7"
                                >
                                  View Full
                                </Button>

                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleCopyFeedback(ev.teacher_feedback || "")}
                                  className="text-xs px-2 h-7 flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </Button>

                                <button
                                  onClick={() => handleDeleteEval(ev.id)}
                                  className="p-1.5 text-text-tertiary hover:text-status-error rounded hover:bg-red-50 transition-colors"
                                  title="Delete evaluation"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-text-tertiary">
                  No submissions evaluated in this session yet.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SESSION SETUP / EDIT MODAL */}
      <Modal
        isOpen={showSetupModal}
        onClose={() => {
          if (activeSession) setShowSetupModal(false);
        }}
        title={activeSession ? "Edit Session Settings" : "Manual Paste — Session Setup"}
      >
        <form onSubmit={handleSaveSettings} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
              Assignment Title / Topic <span className="text-status-error">*</span>
            </label>
            <input
              type="text"
              required
              value={setupTitle}
              onChange={(e) => setSetupTitle(e.target.value)}
              placeholder="e.g. Descriptive Writing — My Favourite Place"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
                Assignment Type
              </label>
              <select
                value={setupType}
                onChange={(e) => setSetupType(e.target.value as AssignmentType)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
              >
                {ASSIGNMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
              General Instructions
            </label>
            <textarea
              value={setupInstructions}
              onChange={(e) => setSetupInstructions(e.target.value)}
              rows={2}
              placeholder="What students were asked to write..."
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-text-secondary uppercase">
                Requirements (Applies to all students in this session)
              </label>
              <button
                type="button"
                onClick={handleAddRequirement}
                className="text-xs font-medium text-accent hover:text-accent-hover flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Requirement
              </button>
            </div>
            <div className="space-y-2">
              {setupRequirements.map((req, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={req.description}
                    onChange={(e) => handleUpdateRequirement(idx, e.target.value)}
                    placeholder={`Requirement ${idx + 1} (e.g. 250-400 words, first-person)`}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveRequirement(idx)}
                    className="p-1.5 text-text-tertiary hover:text-status-error"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {setupRequirements.length === 0 && (
                <p className="text-xs text-text-tertiary italic">
                  No checklist requirements added yet. Click &quot;Add Requirement&quot; if desired.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase mb-1">
              Feedback Instructions <span className="text-status-error">*</span>
            </label>
            <p className="text-xs text-text-tertiary mb-1.5">
              Tell the AI how to write feedback. The AI follows this exact structure for every student.
            </p>
            <textarea
              required
              rows={4}
              value={setupFeedbackInstructions}
              onChange={(e) => setSetupFeedbackInstructions(e.target.value)}
              placeholder="Example: First acknowledge what the student did well with a specific reference to their writing. Then identify one key grammar or vocabulary issue with an example. Then give one clear improvement suggestion. Keep it under 150 words. Sound like a real teacher, not an AI."
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            {activeSession && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowSetupModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={savingSettings}
              className="text-xs"
            >
              {savingSettings ? "Saving..." : "Save Session Settings"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CLEAR SESSION CONFIRMATION MODAL */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear Current Session?"
      >
        <div className="space-y-4 text-left">
          <p className="text-sm text-text-secondary">
            This will permanently clear all session history, settings, and evaluated students for this session. Are you sure?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowClearConfirm(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleClearSession}
              className="text-xs !bg-status-error hover:!bg-red-700"
            >
              Yes, Clear Session
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
