import { create } from "zustand";

interface ToastState {
  message: string | null;
  type: "info" | "success" | "error";
  showToast: (message: string, type?: "info" | "success" | "error", duration?: number) => void;
  hideToast: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  type: "info",
  showToast: (message, type = "info", duration = 2000) => {
    set({ message, type });
    setTimeout(() => {
      set({ message: null });
    }, duration);
  },
  hideToast: () => set({ message: null }),
}));

export const ToastContainer: React.FC = () => {
  const { message, type } = useToast();

  if (!message) return null;

  const bgStyles = {
    info: "bg-text-primary text-white",
    success: "bg-status-success text-white",
    error: "bg-status-error text-white",
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 transition-all transform ease-out duration-200">
      <div className={`px-4 py-2 rounded-md shadow-md text-sm font-medium ${bgStyles[type]}`}>
        {message}
      </div>
    </div>
  );
};
