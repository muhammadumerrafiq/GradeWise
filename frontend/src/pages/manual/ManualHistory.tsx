import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  BookOpen,
  FileDown,
  Trash2,
  ExternalLink,
  Plus,
  ChevronDown,
} from "lucide-react";
import { manualApi } from "../../api/manualApi";
import type { ManualSession } from "../../types";
import { useToast } from "../../components/ui/Toast";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";

export const ManualHistory: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<ManualSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await manualApi.listSessions();
      setSessions(data);
    } catch (err: any) {
      showToast(err.message || "Failed to load sessions", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleDelete = async () => {
    if (!deleteSessionId) return;
    try {
      await manualApi.deleteSession(deleteSessionId);
      showToast("Session deleted", "info");
      setDeleteSessionId(null);
      loadSessions();
    } catch (err: any) {
      showToast(err.message || "Failed to delete session", "error");
    }
  };

  const handleExport = async (sessionId: string, title: string, format: "csv" | "pdf" | "docx") => {
    try {
      await manualApi.downloadExport(
        sessionId,
        format,
        `${title.replace(/[\s\W]+/g, "_")}_evaluations.${format}`
      );
      showToast(`Exported ${format.toUpperCase()}`, "success");
    } catch (err: any) {
      showToast(err.message || "Export failed", "error");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Manual Paste Sessions
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Review past manual paste evaluation sessions, reopen them, or export batch reports.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate("/manual")}
          className="flex items-center gap-1.5 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>New Manual Session</span>
        </Button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-text-secondary">
          Loading manual sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center space-y-3 shadow-sm">
          <BookOpen className="w-10 h-10 text-text-tertiary mx-auto" />
          <h3 className="text-sm font-semibold text-text-primary">No manual sessions yet</h3>
          <p className="text-xs text-text-secondary max-w-sm mx-auto">
            Manual paste allows you to quickly evaluate individual student submissions with custom requirements and feedback instructions.
          </p>
          <div className="pt-2">
            <Button variant="primary" size="sm" onClick={() => navigate("/manual")}>
              Start First Session
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-background border-b border-border text-text-secondary uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">Session Title</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Evaluations</th>
                <th className="py-3.5 px-4">Created</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-text-primary text-sm">{s.title}</div>
                    {s.requirements && s.requirements.length > 0 && (
                      <div className="text-[11px] text-text-tertiary mt-0.5">
                        {s.requirements.length} requirement{s.requirements.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <Badge variant="default" className="uppercase font-medium">
                      {s.assignment_type}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
                      {s.evaluations_count} student{s.evaluations_count !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-text-secondary whitespace-nowrap">
                    {new Date(s.created_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/manual?session_id=${s.id}`)}
                        className="text-xs px-2.5 h-8 flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open</span>
                      </Button>

                      {s.evaluations_count > 0 && (
                        <div className="relative group">
                          <Button variant="secondary" size="sm" className="text-xs px-2 h-8 flex items-center gap-1">
                            <FileDown className="w-3.5 h-3.5" />
                            <ChevronDown className="w-3 h-3 text-text-tertiary" />
                          </Button>
                          <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-border rounded-lg shadow-lg py-1 hidden group-hover:block z-20 text-left">
                            <button
                              onClick={() => handleExport(s.id, s.title, "csv")}
                              className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-background"
                            >
                              CSV
                            </button>
                            <button
                              onClick={() => handleExport(s.id, s.title, "docx")}
                              className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-background"
                            >
                              Word (.docx)
                            </button>
                            <button
                              onClick={() => handleExport(s.id, s.title, "pdf")}
                              className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-background"
                            >
                              PDF (.pdf)
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => setDeleteSessionId(s.id)}
                        className="p-1.5 text-text-tertiary hover:text-status-error rounded hover:bg-red-50 transition-colors"
                        title="Delete session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteSessionId !== null}
        onClose={() => setDeleteSessionId(null)}
        title="Delete Manual Session?"
      >
        <div className="space-y-4 text-left">
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete this session and all its evaluated student records? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeleteSessionId(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDelete}
              className="text-xs !bg-status-error hover:!bg-red-700"
            >
              Yes, Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
