import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, AlertCircle, Play } from "lucide-react";
import {
  getAssignment,
  listSubmissions,
  batchResolveNames,
  startBatchEvaluation,
} from "../api";
import { Button } from "../components/ui/Button";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";

export const NameMapping: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: assignment } = useQuery({
    queryKey: ["assignment", id],
    queryFn: () => getAssignment(id!),
    enabled: !!id,
  });

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["submissions", id],
    queryFn: () => listSubmissions(id!),
    enabled: !!id,
  });

  const [nameEdits, setNameEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (submissions) {
      const initial: Record<string, string> = {};
      submissions.forEach((s) => {
        initial[s.id] = s.student?.name || s.detected_name || "";
      });
      setNameEdits(initial);
    }
  }, [submissions]);

  const batchMutation = useMutation({
    mutationFn: async () => {
      const resolutions = Object.entries(nameEdits).map(([subId, name]) => ({
        submission_id: subId,
        student_name: name.trim(),
      }));
      await batchResolveNames(id!, resolutions);
      await startBatchEvaluation(id!);
    },
    onSuccess: () => {
      showToast("Names confirmed! Evaluation started.", "success");
      navigate(`/assignments/${id}/processing`);
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to confirm names", "error");
    },
  });

  const totalCount = submissions?.length || 0;
  const flaggedCount = submissions?.filter((s) => s.name_flagged).length || 0;
  const resolvedCount = totalCount - flaggedCount;

  const renderConfidenceDots = (confidence = 0) => {
    const dotsCount = Math.round(confidence * 5);
    return (
      <div className="flex items-center gap-1" title={`${Math.round(confidence * 100)}% confidence`}>
        {[1, 2, 3, 4, 5].map((idx) => (
          <span
            key={idx}
            className={`w-2 h-2 rounded-full ${
              idx <= dotsCount
                ? dotsCount >= 3
                  ? "bg-status-success"
                  : "bg-status-warning"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/assignments/${id}?tab=submissions`)}
            className="text-text-secondary hover:text-text-primary p-1 rounded hover:bg-surface transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Student Name Mapping</h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Assignment: {assignment?.title || "Loading..."}
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          icon={<Play className="w-4 h-4" />}
          onClick={() => batchMutation.mutate()}
          disabled={batchMutation.isPending || totalCount === 0}
        >
          {batchMutation.isPending ? "Starting..." : "Confirm All & Start Evaluation"}
        </Button>
      </div>

      {/* Summary Row */}
      <div className="p-4 bg-surface border border-border rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            {resolvedCount} names auto-detected
          </span>
          <span className="text-text-tertiary">·</span>
          <span
            className={`text-sm font-semibold ${
              flaggedCount > 0 ? "text-status-warning" : "text-status-success"
            }`}
          >
            {flaggedCount} {flaggedCount === 1 ? "needs review" : "need review"}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          Edit any names directly below before starting evaluation.
        </p>
      </div>

      {/* Mapping Table */}
      <Card>
        {isLoading ? (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        ) : !submissions || submissions.length === 0 ? (
          <CardBody className="text-center py-12 text-sm text-text-secondary">
            No submissions found to map.
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-text-secondary text-xs uppercase font-medium">
                  <th className="px-5 py-3">Original Filename</th>
                  <th className="px-5 py-3">Confidence</th>
                  <th className="px-5 py-3">Student Name</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {submissions.map((sub) => {
                  const isFlagged = sub.name_flagged;
                  const currentVal = nameEdits[sub.id] || "";

                  return (
                    <tr
                      key={sub.id}
                      className={`hover:bg-[#F9FAFB] transition-colors ${
                        isFlagged ? "bg-amber-50/30" : ""
                      }`}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-text-secondary">
                        {sub.original_filename}
                      </td>
                      <td className="px-5 py-3">
                        {renderConfidenceDots(sub.name_confidence)}
                      </td>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) =>
                            setNameEdits({ ...nameEdits, [sub.id]: e.target.value })
                          }
                          placeholder="Enter student name..."
                          className={`w-full rounded px-2.5 py-1.5 text-sm bg-surface border transition-colors focus:outline-none focus:ring-1 focus:ring-accent ${
                            isFlagged
                              ? "border-status-warning text-text-primary font-medium"
                              : "border-border text-text-primary"
                          }`}
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isFlagged ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning">
                            <AlertCircle className="w-3.5 h-3.5" /> Needs Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
                            <Check className="w-3.5 h-3.5" /> Auto-detected
                          </span>
                        )}
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
