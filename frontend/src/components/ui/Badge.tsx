import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type BadgeVariant =
  | "default"
  | "pending_review"
  | "reviewed"
  | "approved"
  | "error"
  | "warning"
  | "info"
  | "success";

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ variant = "default", className, children }) => {
  const variantStyles: Record<BadgeVariant, string> = {
    default: "bg-gray-100 text-gray-700 border-gray-200",
    pending_review: "bg-status-warning-bg text-status-warning border-amber-200",
    reviewed: "bg-status-info-bg text-status-info border-blue-200",
    approved: "bg-status-success-bg text-status-success border-green-200",
    error: "bg-status-error-bg text-status-error border-red-200",
    warning: "bg-status-warning-bg text-status-warning border-amber-200",
    info: "bg-status-info-bg text-status-info border-blue-200",
    success: "bg-status-success-bg text-status-success border-green-200",
  };

  return (
    <span
      className={twMerge(
        clsx(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide whitespace-nowrap",
          variantStyles[variant] || variantStyles.default,
          className
        )
      )}
    >
      {children}
    </span>
  );
};
