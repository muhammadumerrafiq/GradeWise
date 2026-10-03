import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Archive, Eye, Edit, BookOpen } from "lucide-react";
import { listAssignments, deleteAssignment } from "../api";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card, CardBody } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { format } from "date-fns";

export const Assignments: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [filterTab, setFilterTab] = useState<"all" | "active" | "archived">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignments", filterTab, searchQuery],
    queryFn: () => listAssignments(filterTab === "all" ? undefined : filterTab, searchQuery),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => deleteAssignment(id, true),
    onSuccess: () => {
      showToast("Assignment archived", "success");
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (err: any) => {
      showToast(err.message || "Failed to archive", "error");
    },
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Assignments</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Manage your English writing assignments, rubrics, and submissions
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => navigate("/assignments/new")}
        >
          New Assignment
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-border w-full sm:w-auto">
          {(["all", "active", "archived"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                filterTab === tab
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assignments..."
            className="w-full pl-9 pr-3 py-1.5 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Assignments Table */}
      <Card>
        {isLoading ? (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        ) : !assignments || assignments.length === 0 ? (
          <CardBody className="text-center py-16">
            <BookOpen className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
            <p className="text-sm font-semibold text-text-primary mb-1">No assignments found</p>
            <p className="text-xs text-text-secondary max-w-sm mx-auto mb-4">
              {searchQuery
                ? `No assignments match "${searchQuery}".`
                : "Create your first assignment with a custom rubric to start grading."}
            </p>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => navigate("/assignments/new")}
            >
              New Assignment
            </Button>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-text-secondary text-xs uppercase font-medium">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Submissions</th>
                  <th className="px-5 py-3 font-medium">Reviewed</th>
                  <th className="px-5 py-3 font-medium">Approved</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assignments.map((a) => {
                  const createdDate = a.created_at
                    ? format(new Date(a.created_at), "MMM d, yyyy")
                    : "-";

                  return (
                    <tr
                      key={a.assignment_id}
                      className="hover:bg-[#F9FAFB] transition-colors"
                    >
                      <td className="px-5 py-3.5 font-medium text-text-primary">
                        <Link
                          to={`/assignments/${a.assignment_id}`}
                          className="hover:text-accent font-medium block"
                        >
                          {a.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary capitalize">
                        {a.type}
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary text-xs">
                        {createdDate}
                      </td>
                      <td className="px-5 py-3.5 text-text-primary font-medium">
                        {a.total_submissions}
                      </td>
                      <td className="px-5 py-3.5 text-status-warning font-medium">
                        {a.pending_review_count}
                      </td>
                      <td className="px-5 py-3.5 text-status-success font-medium">
                        {a.approved_count}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/assignments/${a.assignment_id}`)}
                            title="View"
                            className="p-1 text-text-secondary hover:text-accent rounded hover:bg-background"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/assignments/${a.assignment_id}?edit=true`)}
                            title="Edit"
                            className="p-1 text-text-secondary hover:text-text-primary rounded hover:bg-background"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {a.status !== "archived" && (
                            <button
                              onClick={() => archiveMutation.mutate(a.assignment_id)}
                              title="Archive"
                              className="p-1 text-text-secondary hover:text-status-error rounded hover:bg-background"
                            >
                              <Archive className="w-4 h-4" />
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
  );
};
