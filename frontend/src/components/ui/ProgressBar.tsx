import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  className?: string;
  barClassName?: string;
  showText?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  className,
  barClassName,
  showText = false,
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  let colorClass = "bg-accent";
  if (percentage >= 80) colorClass = "bg-status-success";
  else if (percentage >= 60) colorClass = "bg-status-warning";
  else if (percentage > 0) colorClass = "bg-status-error";

  return (
    <div className={twMerge("w-full", className)}>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={twMerge(
            clsx("h-full rounded-full transition-all duration-300", colorClass, barClassName)
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showText && (
        <span className="block text-right text-xs font-medium text-text-secondary mt-1">
          {percentage.toFixed(0)}%
        </span>
      )}
    </div>
  );
};
