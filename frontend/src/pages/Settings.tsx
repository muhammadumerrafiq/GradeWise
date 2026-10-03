import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Key, Database, User, ShieldCheck } from "lucide-react";
import { getSettings, updateSettings, testGeminiKey } from "../api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardHeader, CardBody, CardFooter } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";
import type { GradeScaleEntry } from "../types";

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [gradeScale, setGradeScale] = useState<GradeScaleEntry[]>([]);
  const [autoDeleteDays, setAutoDeleteDays] = useState(30);
  const [defaultFormat, setDefaultFormat] = useState("pdf");

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (settings) {
      setTeacherName(settings.teacher_name || "");
      setTeacherEmail(settings.teacher_email || "");
      setGradeScale(settings.grade_scale || []);
      setAutoDeleteDays(settings.auto_delete_days || 30);
      setDefaultFormat(settings.default_export_format || "pdf");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        teacher_name: teacherName.trim(),
        teacher_email: teacherEmail.trim(),
        grade_scale: gradeScale,
        auto_delete_days: autoDeleteDays,
        default_export_format: defaultFormat,
      };
      if (geminiKeyInput.trim()) {
        payload.gemini_api_key = geminiKeyInput.trim();
      }
      return updateSettings(payload);
    },
    onSuccess: () => {
      showToast("Settings saved successfully!", "success");
      setGeminiKeyInput("");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to save settings", "error");
    },
  });

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const keyToTest = geminiKeyInput.trim() ? geminiKeyInput.trim() : undefined;
      const res = await testGeminiKey(keyToTest);
      setTestResult(res);
      if (res.success) {
        showToast("Gemini API connection verified!", "success");
      } else {
        showToast("Gemini API test failed", "error");
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Failed to reach Gemini API" });
      showToast("Connection failed", "error");
    } finally {
      setIsTesting(false);
    }
  };

  const formatBytes = (bytes = 0) => {
    if (bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Header */}
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Configure API credentials, teacher profile, and grading preferences
        </p>
      </div>

      {/* Teacher Profile */}
      <Card>
        <CardHeader className="flex items-center gap-2">
          <User className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Teacher Profile
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Teacher Name"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="e.g. Ms. Sarah Jenkins"
            />
            <Input
              label="Email Address"
              type="email"
              value={teacherEmail}
              onChange={(e) => setTeacherEmail(e.target.value)}
              placeholder="teacher@school.edu"
            />
          </div>
        </CardBody>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
              Gemini API Configuration
            </h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {settings?.gemini_api_key_configured ? (
              <span className="flex items-center gap-1 text-status-success">
                <span className="w-2 h-2 rounded-full bg-status-success inline-block" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-status-error">
                <span className="w-2 h-2 rounded-full bg-status-error inline-block" />
                Not Connected
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-text-primary">
                Gemini API Key
              </label>
              <span className="text-xs text-text-secondary font-mono">
                Current: {settings?.gemini_api_key_masked || "None"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="Paste new Gemini API key to update (e.g. AIzaSy...)"
                className="flex-1 rounded bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
            </div>
            <p className="text-[11px] text-text-tertiary mt-1">
              Your key is securely stored in backend environment variables and is never exposed to the browser.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded text-xs flex items-center gap-2 ${
                testResult.success
                  ? "bg-status-success-bg text-status-success border border-green-200"
                  : "bg-status-error-bg text-status-error border border-red-200"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Gemini Model (Read-Only)
              </label>
              <input
                type="text"
                readOnly
                value={settings?.gemini_model || "gemini-1.5-pro"}
                className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono text-text-primary select-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Security Policy
              </label>
              <div className="flex items-center gap-1.5 text-xs text-status-success bg-background p-2 rounded border border-border">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero LMS integration · Local evaluation</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Default Grade Scale */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Default Grade Scale
          </h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-text-secondary">
            Default thresholds applied to new assignments when converting percentages to letter grades.
          </p>
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
      </Card>

      {/* Storage & Retention */}
      <Card>
        <CardHeader className="flex items-center gap-2">
          <Database className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Storage & Retention
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Used Local Storage
              </span>
              <span className="text-lg font-bold text-text-primary">
                {formatBytes(settings?.storage_used_bytes)}
              </span>
              <p className="text-[11px] text-text-tertiary mt-1">
                Includes uploads and generated export reports.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Auto-Delete Generated Exports
              </label>
              <select
                value={autoDeleteDays}
                onChange={(e) => setAutoDeleteDays(parseInt(e.target.value))}
                className="w-full rounded bg-surface border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value={7}>After 7 days</option>
                <option value={30}>After 30 days</option>
                <option value={90}>After 90 days</option>
                <option value={0}>Never auto-delete</option>
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Save Settings Button */}
      <div className="flex justify-end pt-2">
        <Button
          variant="primary"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
};
