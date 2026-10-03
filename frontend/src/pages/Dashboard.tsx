import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Upload, ArrowRight, BookOpen } from "lucide-react";
import { listAssignments, getSettings } from "../api";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardBody } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const { data: assignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => listAssignments(),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

  // Calculate high-level stats
  const activeAssignmentsCount = assignments?.filter((a) => a.status === "active").length || 0;
  const totalSubmissionsCount =
    assignments?.reduce((acc, curr) => acc + curr.total_submissions, 0) || 0;
  const totalReviewedCount =
    assignments?.reduce((acc, curr) => acc + curr.approved_count, 0) || 0;
  const totalPendingCount =
    assignments?.reduce((acc, curr) => acc + curr.pending_review_count, 0) || 0;

  const recentAssignments = assignments?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            Welcome back, {settings?.teacher_name || "Teacher"}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            English Assignment Evaluation Workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => {
              if (assignments && assignments.length > 0) {
                navigate(`/assignments/${assignments[0].assignment_id}?tab=submissions`);
              } else {
                navigate("/assignments/new");
              }
            }}
          >
            Upload Submissions
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate("/assignments/new")}
          >
            New Assignment
          </Button>
        </div>
      </div>

      {/* Stats Row — Numbers only, no charts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-5 shadow-sm">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
            Active Assignments
          </span>
          {loadingAssignments ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="text-2xl font-bold text-text-primary">{activeAssignmentsCount}</span>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 shadow-sm">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
            Total Submissions
          </span>
          {loadingAssignments ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="text-2xl font-bold text-text-primary">{totalSubmissionsCount}</span>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 shadow-sm">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
            Reviewed & Approved
          </span>
          {loadingAssignments ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="text-2xl font-bold text-status-success">{totalReviewedCount}</span>
          )}
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 shadow-sm">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
            Pending Review
          </span>
          {loadingAssignments ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="text-2xl font-bold text-status-warning">{totalPendingCount}</span>
          )}
        </div>
      </div>

      {/* Recent Assignments Table */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
            Recent Assignments
          </h2>
          <Link
            to="/assignments"
            className="text-xs font-medium text-accent hover:text-accent-hover flex items-center gap-1"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        {loadingAssignments ? (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        ) : recentAssignments.length === 0 ? (
          <CardBody className="text-center py-12">
            <BookOpen className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
            <p className="text-sm font-medium text-text-primary mb-1">No assignments created yet</p>
            <p className="text-xs text-text-secondary max-w-sm mx-auto mb-4">
              Get started by creating an English writing assignment with rubrics and criteria.
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => navigate("/assignments/new")}
            >
              Create Assignment
            </Button>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-text-secondary text-xs uppercase font-medium">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Submissions</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentAssignments.map((a) => (
                  <tr
                    key={a.assignment_id}
                    onClick={() => navigate(`/assignments/${a.assignment_id}`)}
                    className="hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5 font-medium text-text-primary">
                      {a.title}
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary capitalize">
                      {a.type}
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">
                      {a.total_submissions} files
                      {a.approved_count > 0 && (
                        <span className="text-xs text-status-success ml-1.5">
                          ({a.approved_count} approved)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        variant={
                          a.status === "active"
                            ? "success"
                            : a.status === "draft"
                            ? "warning"
                            : "default"
                        }
                      >
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right text-text-tertiary hover:text-accent">
                      <ArrowRight className="w-4 h-4 inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
