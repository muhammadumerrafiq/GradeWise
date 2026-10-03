import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  FolderOpen,
  PlusCircle,
  FileEdit,
  PlayCircle,
  History,
  Settings,
  GraduationCap,
} from "lucide-react";
import { ToastContainer } from "../ui/Toast";

export const AppLayout: React.FC = () => {
  const location = useLocation();

  const isBulkActive = location.pathname.startsWith("/assignments");
  const isManualActive = location.pathname.startsWith("/manual");

  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      {/* 240px Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-surface border-r border-border flex flex-col justify-between py-5 fixed inset-y-0 left-0 z-40">
        <div>
          {/* Brand Header */}
          <div className="px-5 mb-6 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent text-white flex items-center justify-center shadow-sm flex-shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-text-primary tracking-tight leading-none block">
                GradeWise
              </span>
              <span className="text-[10px] text-text-tertiary tracking-wider font-semibold block mt-0.5">
                AI EVALUATOR
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="px-3 space-y-4">
            {/* Dashboard */}
            <div>
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-accent-light text-accent font-semibold"
                      : "text-text-secondary hover:text-text-primary hover:bg-slate-50"
                  }`
                }
              >
                <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                <span>Dashboard</span>
              </NavLink>
            </div>

            {/* Divider */}
            <div className="pt-1 pb-1 border-t border-border" />

            {/* MODULE 1: Bulk Rubric */}
            <div className="space-y-1">
              <div className="px-3 py-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 text-accent" />
                  Bulk Rubric
                </span>
                <span className="text-[9px] px-1.5 py-0.2 bg-blue-50 text-accent rounded font-medium">
                  Mod 1
                </span>
              </div>

              <div className="pl-2 space-y-0.5">
                <NavLink
                  to="/assignments"
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive && !location.pathname.includes("/new")
                        ? "bg-accent-light text-accent font-semibold"
                        : "text-text-secondary hover:text-text-primary hover:bg-slate-50"
                    }`
                  }
                >
                  <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>My Assignments</span>
                </NavLink>

                <NavLink
                  to="/assignments/new"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive
                        ? "bg-accent-light text-accent font-semibold"
                        : "text-text-secondary hover:text-text-primary hover:bg-slate-50"
                    }`
                  }
                >
                  <PlusCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>+ New Assignment</span>
                </NavLink>
              </div>
            </div>

            {/* Divider */}
            <div className="pt-1 pb-1 border-t border-border" />

            {/* MODULE 2: Manual Paste */}
            <div className="space-y-1">
              <div className="px-3 py-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                <span className="flex items-center gap-1.5">
                  <FileEdit className="w-3.5 h-3.5 text-emerald-600" />
                  Manual Paste
                </span>
                <span className="text-[9px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded font-medium">
                  Mod 2
                </span>
              </div>

              <div className="pl-2 space-y-0.5">
                <NavLink
                  to="/manual"
                  end
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700 font-semibold"
                        : "text-text-secondary hover:text-text-primary hover:bg-slate-50"
                    }`
                  }
                >
                  <PlayCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Current Session</span>
                </NavLink>

                <NavLink
                  to="/manual/history"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700 font-semibold"
                        : "text-text-secondary hover:text-text-primary hover:bg-slate-50"
                    }`
                  }
                >
                  <History className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Session History</span>
                </NavLink>
              </div>
            </div>

            {/* Divider */}
            <div className="pt-1 pb-1 border-t border-border" />

            {/* Settings */}
            <div>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-accent-light text-accent font-semibold"
                      : "text-text-secondary hover:text-text-primary hover:bg-slate-50"
                  }`
                }
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span>Settings</span>
              </NavLink>
            </div>
          </nav>
        </div>

        {/* Footer info */}
        <div className="px-5 text-[11px] text-text-tertiary">
          GradeWise v1.2.0
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-60 min-h-screen flex flex-col">
        <div className="max-w-[1300px] w-full mx-auto px-6 md:px-8 py-6 flex-1">
          <Outlet />
        </div>
      </main>

      <ToastContainer />
    </div>
  );
};

export default AppLayout;
