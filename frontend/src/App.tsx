import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Assignments } from "./pages/Assignments";
import { CreateAssignment } from "./pages/CreateAssignment";
import { AssignmentDetail } from "./pages/AssignmentDetail";
import { NameMapping } from "./pages/NameMapping";
import { Processing } from "./pages/Processing";
import { Results } from "./pages/Results";
import { StudentDetail } from "./pages/StudentDetail";
import { ExportPage } from "./pages/Export";
import { SettingsPage } from "./pages/Settings";
import { ManualPaste } from "./pages/manual/ManualPaste";
import { ManualHistory } from "./pages/manual/ManualHistory";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            {/* Module 1: Bulk Rubric Assignments */}
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/assignments/new" element={<CreateAssignment />} />
            <Route path="/assignments/:id" element={<AssignmentDetail />} />
            <Route path="/assignments/:id/name-mapping" element={<NameMapping />} />
            <Route path="/assignments/:id/processing" element={<Processing />} />
            <Route path="/assignments/:id/results" element={<Results />} />
            <Route path="/assignments/:id/export" element={<ExportPage />} />
            <Route path="/evaluations/:id" element={<StudentDetail />} />
            {/* Module 2: Manual Paste Workflow */}
            <Route path="/manual" element={<ManualPaste />} />
            <Route path="/manual/history" element={<ManualHistory />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
