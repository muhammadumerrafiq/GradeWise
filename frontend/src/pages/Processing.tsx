import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Pause, Play, XCircle, RotateCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import {
  getAssignment,
  getProcessingProgress,
  pauseEvaluation,
  resumeEvaluation,
  cancelEvaluation,
  retrySubmission,
} from "../api";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { ProgressBar } from "../components/ui/ProgressBar";
import { useToast } from "../components/ui/Toast";

export const Processing: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: assignment } = useQuery({
    queryKey: ["assignment", id],
    queryFn: () => getAssignment(id!),
    enabled: !!id,
  });

  const { data: progress } = useQuery({
    queryKey: ["processing-progress", id],
    queryFn: () => getProcessingProgress(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "completed" || data?.status === "cancelled" || data?.status === "failed") {
        return false;
      }
      return 2000; // Poll every 2 seconds
    },
  });

  // Auto-navigate to Results on completion
  useEffect(() => {
    if (progress && progress.status === "completed" && progress.total_count > 0) {
      showToast("Evaluation complete! Redirecting to results...", "success");
      const timer = setTimeout(() => {
        navigate(`/assignments/${id}/results`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [progress, id, navigate, showToast]);

  const pauseMutation = useMutation({
    mutationFn: () => pauseEvaluation(id!),
    onSuccess: () => showToast("Evaluation paused", "info"),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeEvaluation(id!),
    onSuccess: () => showToast("Evaluation resumed", "info"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelEvaluation(id!),
    onSuccess: () => {
      showToast("Evaluation cancelled", "error");
      navigate(`/assignments/${id}`);
    },
  });

  const retryMutation = useMutation({
    mutationFn: (subId: string) => retrySubmission(subId),
    onSuccess: () => showToast("Retry scheduled", "info"),
  });

  const total = progress?.total_count || 0;
  const completed = progress?.completed_count || 0;
  const failed = progress?.failed_count || 0;
  const inProgressName = progress?.current_name;
  const isPaused = progress?.status === "paused";
  const estSeconds = progress?.estimated_seconds_remaining || 0;

  const formatTime = (secs: number) => {
    if (secs <= 0) return "Estimating...";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            Processing: {assignment?.title || "Assignment"}
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Individual AI evaluations in progress · Polling every 2s
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isPaused ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Play className="w-4 h-4" />}
              onClick={() => resumeMutation.mutate()}
            >
              Resume
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<Pause className="w-4 h-4" />}
              onClick={() => pauseMutation.mutate()}
              disabled={progress?.status === "completed"}
            >
              Pause
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            icon={<XCircle className="w-4 h-4" />}
            onClick={() => cancelMutation.mutate()}
            className="text-status-error hover:bg-status-error-bg"
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Large Progress Card */}
      <Card>
        <CardBody className="space-y-4 py-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-text-primary">
              {completed + failed} of {total} completed
            </span>
            <span className="text-xs text-text-secondary flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Est. time remaining: <strong className="text-text-primary">{formatTime(estSeconds)}</strong>
            </span>
          </div>

          <ProgressBar
            value={total > 0 ? ((completed + failed) / total) * 100 : 0}
            className="h-3"
          />

          {inProgressName && (
            <div className="p-3 bg-accent-light border border-blue-200 rounded text-xs flex items-center justify-between">
              <span className="text-accent font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                Currently evaluating: <strong>{inProgressName}</strong>
              </span>
              <span className="text-text-tertiary">Running Gemini 1.5 Pro</span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Three Columns: Completed | In Progress | Queued */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Completed */}
        <Card>
          <CardHeader className="flex justify-between items-center py-3">
            <span className="text-xs font-bold text-status-success uppercase tracking-wider">
              Completed ({progress?.completed_list?.length || 0})
            </span>
            <CheckCircle2 className="w-4 h-4 text-status-success" />
          </CardHeader>
          <CardBody className="p-3 max-h-64 overflow-y-auto space-y-2">
            {!progress?.completed_list || progress.completed_list.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-4">None yet</p>
            ) : (
              progress.completed_list.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs p-2 bg-background border border-border rounded"
                >
                  <span className="font-medium text-text-primary truncate mr-2">{item.name}</span>
                  {item.score !== undefined && item.max_score !== undefined && (
                    <span className="text-status-success font-semibold flex-shrink-0">
                      {item.score}/{item.max_score}
                    </span>
                  )}
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* In Progress */}
        <Card>
          <CardHeader className="flex justify-between items-center py-3">
            <span className="text-xs font-bold text-accent uppercase tracking-wider">
              In Progress
            </span>
            <RotateCw className={`w-4 h-4 text-accent ${inProgressName ? "animate-spin" : ""}`} />
          </CardHeader>
          <CardBody className="p-3 max-h-64 overflow-y-auto space-y-2">
            {inProgressName ? (
              <div className="p-3 bg-accent-light border border-blue-200 rounded text-xs">
                <p className="font-semibold text-text-primary">{inProgressName}</p>
                <p className="text-[11px] text-text-secondary mt-1">Generating evaluation...</p>
              </div>
            ) : (
              <p className="text-xs text-text-tertiary text-center py-4">Waiting...</p>
            )}
          </CardBody>
        </Card>

        {/* Queued */}
        <Card>
          <CardHeader className="flex justify-between items-center py-3">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Queued ({progress?.queued_names?.length || 0})
            </span>
            <Clock className="w-4 h-4 text-text-secondary" />
          </CardHeader>
          <CardBody className="p-3 max-h-64 overflow-y-auto space-y-1.5">
            {!progress?.queued_names || progress.queued_names.length === 0 ? (
              <p className="text-xs text-text-tertiary text-center py-4">Queue empty</p>
            ) : (
              progress.queued_names.map((name, idx) => (
                <div key={idx} className="text-xs p-2 bg-background border border-border rounded truncate text-text-secondary">
                  {name}
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {/* Errors Section (if any) */}
      {progress?.errors && progress.errors.length > 0 && (
        <Card className="border-status-error/30">
          <CardHeader className="bg-status-error-bg py-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-status-error" />
            <span className="text-xs font-bold text-status-error uppercase tracking-wider">
              Failed Submissions ({progress.errors.length})
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-border">
              {progress.errors.map((err, idx) => (
                <div
                  key={idx}
                  className="p-3 flex items-center justify-between gap-4 text-xs hover:bg-[#F9FAFB]"
                >
                  <div className="flex-1">
                    <span className="font-semibold text-text-primary block">{err.name}</span>
                    <span className="text-status-error">{err.error}</span>
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    icon={<RotateCw className="w-3 h-3" />}
                    onClick={() => retryMutation.mutate(err.submission_id)}
                  >
                    Retry
                  </Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Quick Direct Link to Results if some are ready */}
      {completed > 0 && (
        <div className="text-center pt-2">
          <button
            onClick={() => navigate(`/assignments/${id}/results`)}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Jump to Results Table ({completed} completed) →
          </button>
        </div>
      )}
    </div>
  );
};
