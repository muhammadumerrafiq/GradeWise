import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { createAssignment } from "../api";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { Card, CardHeader, CardBody, CardFooter } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import type { AssignmentType, GradeScaleEntry } from "../types";

const ASSIGNMENT_TYPES: { value: AssignmentType; label: string }[] = [
  { value: "essay", label: "Essay" },
  { value: "narrative", label: "Narrative Writing" },
  { value: "descriptive", label: "Descriptive Writing" },
  { value: "paragraph", label: "Paragraph Writing" },
  { value: "letter", label: "Formal / Informal Letter" },
  { value: "report", label: "Book / Event Report" },
  { value: "creative", label: "Creative Writing" },
  { value: "general", label: "General Writing" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_GRADE_SCALE: GradeScaleEntry[] = [
  { min_pct: 90, label: "A" },
  { min_pct: 80, label: "B" },
  { min_pct: 70, label: "C" },
  { min_pct: 60, label: "D" },
  { min_pct: 0, label: "F" },
];

export const CreateAssignment: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<AssignmentType>("essay");
  const [totalMarks, setTotalMarks] = useState<number>(20);
  const [instructions, setInstructions] = useState("");
  const [gradingNotes, setGradingNotes] = useState("");

  const [requirements, setRequirements] = useState<string[]>([
    "600-800 words in length",
    "Proper introductory thesis and concluding summary",
  ]);

  const [rubricCriteria, setRubricCriteria] = useState<
    Array<{ name: string; max_marks: number; description: string }>
  >([
    { name: "Content & Ideas", max_marks: 5, description: "Depth of ideas, evidence, and argument development" },
    { name: "Organization & Structure", max_marks: 5, description: "Logical flow, paragraph transitions, and coherence" },
    { name: "Grammar & Sentence Structure", max_marks: 5, description: "Grammatical accuracy, syntax variety, and mechanics" },
    { name: "Vocabulary & Style", max_marks: 5, description: "Word choice, tone, and appropriate register" },
  ]);

  const [showGradeScale, setShowGradeScale] = useState(false);
  const [gradeScale, setGradeScale] = useState<GradeScaleEntry[]>(DEFAULT_GRADE_SCALE);
  const [feedbackInstructions, setFeedbackInstructions] = useState("");

  // Live Rubric Sum Calculation
  const rubricSum = rubricCriteria.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0);
  const isRubricValid = rubricSum === Number(totalMarks) && rubricCriteria.length > 0;

  const createMutation = useMutation({
    mutationFn: (assignmentStatus: "active" | "draft") => {
      if (!title.trim()) throw new Error("Title is required.");
      if (Number(totalMarks) <= 0) throw new Error("Total marks must be greater than 0.");
      if (rubricCriteria.length === 0) throw new Error("At least one rubric criterion is required.");
      if (rubricSum !== Number(totalMarks)) {
        throw new Error(`Rubric sum (${rubricSum}) must equal total marks (${totalMarks}).`);
      }
      if (!feedbackInstructions.trim()) {
        throw new Error("Feedback instructions are required. Please tell the AI how to structure student feedback.");
      }

      const payload = {
        title: title.trim(),
        type,
        instructions: instructions.trim() || undefined,
        grading_notes: gradingNotes.trim() || undefined,
        feedback_instructions: feedbackInstructions.trim(),
        total_marks: Number(totalMarks),
        grade_scale: gradeScale,
        status: assignmentStatus,
        rubric_criteria: rubricCriteria.map((c, idx) => ({
          name: c.name.trim(),
          max_marks: Number(c.max_marks),
          description: c.description.trim() || undefined,
          sort_order: idx,
        })),
        requirements: requirements
          .filter((r) => r.trim())
          .map((r, idx) => ({
            description: r.trim(),
            sort_order: idx,
          })),
      };

      return createAssignment(payload);
    },
    onSuccess: (data) => {
      showToast("Assignment saved successfully!", "success");
      navigate(`/assignments/${data.id}`);
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to create assignment", "error");
    },
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <button
          onClick={() => navigate("/assignments")}
          className="text-text-secondary hover:text-text-primary p-1 rounded hover:bg-surface transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Create Assignment</h1>
          <p className="text-xs text-text-secondary">Define instructions, checklist requirements, and rubric criteria</p>
        </div>
      </div>

      {/* Main Details */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Assignment Details</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Assignment Title *"
                placeholder="e.g. Persuasive Essay on Environmental Policy"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Assignment Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AssignmentType)}
                className="w-full rounded bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {ASSIGNMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                type="number"
                label="Total Marks *"
                min={1}
                value={totalMarks}
                onChange={(e) => setTotalMarks(parseInt(e.target.value) || 0)}
                required
              />
            </div>

            <div className="md:col-span-2 flex items-end">
              <div
                className={`p-2.5 rounded border text-xs font-medium w-full flex items-center gap-2 ${
                  isRubricValid
                    ? "bg-status-success-bg text-status-success border-green-200"
                    : "bg-status-error-bg text-status-error border-red-200"
                }`}
              >
                {isRubricValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>Rubric Total: {rubricSum} / {totalMarks} marks ✓</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Rubric Total: {rubricSum} / {totalMarks} marks ✗ (must match total marks)</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <Textarea
            label="Instructions (Prompt given to students)"
            placeholder="Enter the complete assignment prompt, guiding questions, or context provided to students..."
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />

          <Textarea
            label="Grading Notes for AI (Optional)"
            placeholder="Special instructions for AI evaluator (e.g. 'Pay special attention to tone', 'Strict on run-on sentences')..."
            rows={2}
            value={gradingNotes}
            onChange={(e) => setGradingNotes(e.target.value)}
          />
        </CardBody>
      </Card>

      {/* Requirements Section */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              Checklist Requirements
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">Specific constraints the AI will check (PASS / FAIL / PARTIAL)</p>
          </div>
          <Button
            variant="secondary"
            size="xs"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setRequirements([...requirements, ""])}
          >
            Add Requirement
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          {requirements.map((req, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs font-mono text-text-tertiary w-5 text-center">{idx + 1}.</span>
              <Input
                placeholder={`e.g. Word count: 500-700 words, First-person perspective, Contains at least 2 quotes`}
                value={req}
                onChange={(e) => {
                  const updated = [...requirements];
                  updated[idx] = e.target.value;
                  setRequirements(updated);
                }}
              />
              <button
                type="button"
                onClick={() => setRequirements(requirements.filter((_, i) => i !== idx))}
                className="text-text-tertiary hover:text-status-error p-1 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {requirements.length === 0 && (
            <p className="text-xs text-text-tertiary text-center py-2">No checklist requirements added yet.</p>
          )}
        </CardBody>
      </Card>

      {/* Rubric Criteria Section */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              Rubric Criteria
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">Define each scoring dimension and its maximum marks</p>
          </div>
          <Button
            variant="secondary"
            size="xs"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() =>
              setRubricCriteria([
                ...rubricCriteria,
                { name: "", max_marks: 5, description: "" },
              ])
            }
          >
            Add Criterion
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {rubricCriteria.map((crit, idx) => (
            <div
              key={idx}
              className="p-3 bg-background border border-border rounded-lg space-y-2 relative"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Criterion name (e.g. Content & Analysis)"
                    value={crit.name}
                    onChange={(e) => {
                      const updated = [...rubricCriteria];
                      updated[idx].name = e.target.value;
                      setRubricCriteria(updated);
                    }}
                  />
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Marks"
                    value={crit.max_marks}
                    onChange={(e) => {
                      const updated = [...rubricCriteria];
                      updated[idx].max_marks = parseInt(e.target.value) || 0;
                      setRubricCriteria(updated);
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setRubricCriteria(rubricCriteria.filter((_, i) => i !== idx))}
                  className="text-text-tertiary hover:text-status-error p-1 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Criterion description or scoring expectations (optional)"
                  value={crit.description}
                  onChange={(e) => {
                    const updated = [...rubricCriteria];
                    updated[idx].description = e.target.value;
                    setRubricCriteria(updated);
                  }}
                  className="w-full bg-surface border border-border rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          ))}

          {/* Bottom Live Rubric Total Display */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-sm font-medium text-text-primary">Total Rubric Marks:</span>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-bold ${
                  isRubricValid ? "text-status-success" : "text-status-error"
                }`}
              >
                {rubricSum} / {totalMarks} marks
              </span>
              {isRubricValid ? (
                <CheckCircle2 className="w-4 h-4 text-status-success inline" />
              ) : (
                <AlertCircle className="w-4 h-4 text-status-error inline" />
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Grade Scale (Optional Collapsible) */}
      <Card>
        <CardHeader
          onClick={() => setShowGradeScale(!showGradeScale)}
          className="cursor-pointer flex items-center justify-between hover:bg-background transition-colors"
        >
          <div>
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              Grade Scale (Optional)
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">Customize letter grade percentage thresholds</p>
          </div>
          {showGradeScale ? <ChevronUp className="w-4 h-4 text-text-secondary" /> : <ChevronDown className="w-4 h-4 text-text-secondary" />}
        </CardHeader>
        {showGradeScale && (
          <CardBody className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {gradeScale.map((entry, idx) => (
                <div key={idx} className="p-2 border border-border rounded bg-background text-center">
                  <input
                    type="text"
                    value={entry.label}
                    onChange={(e) => {
                      const updated = [...gradeScale];
                      updated[idx].label = e.target.value;
                      setGradeScale(updated);
                    }}
                    className="w-full text-center font-bold text-sm bg-surface border border-border rounded py-1 mb-1 focus:outline-none"
                  />
                  <div className="flex items-center justify-center gap-1 text-xs text-text-secondary">
                    <span>≥</span>
                    <input
                      type="number"
                      value={entry.min_pct}
                      onChange={(e) => {
                        const updated = [...gradeScale];
                        updated[idx].min_pct = parseInt(e.target.value) || 0;
                        setGradeScale(updated);
                      }}
                      className="w-12 text-center bg-surface border border-border rounded py-0.5 focus:outline-none"
                    />
                    <span>%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        )}
      </Card>

      {/* Section E: Feedback Instructions */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              Section E: Feedback Instructions *
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Tell the AI exactly how to write feedback for each student (tone, structure, and constraints)
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          <Textarea
            label="Feedback Writing Instructions *"
            placeholder={`Describe how feedback should be written. Example:
Start with one genuine strength from the student's work.
Then mention the most important grammar or structure issue with a specific example from their writing.
End with one clear, actionable suggestion.
Keep the tone encouraging but honest.
Do not use generic phrases like 'good effort' or 'well done'.`}
            rows={6}
            value={feedbackInstructions}
            onChange={(e) => setFeedbackInstructions(e.target.value)}
            required
          />
          <p className="text-xs text-text-tertiary">
            This field is required. The AI will strictly follow these instructions when generating feedback for every submission.
          </p>
        </CardBody>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-3">
        <Button
          variant="secondary"
          onClick={() => createMutation.mutate("draft")}
          disabled={createMutation.isPending}
        >
          Save Draft
        </Button>
        <Button
          variant="primary"
          onClick={() => createMutation.mutate("active")}
          disabled={createMutation.isPending || !isRubricValid}
        >
          {createMutation.isPending ? "Saving..." : "Save Assignment Setup"}
        </Button>
      </div>
    </div>
  );
};
