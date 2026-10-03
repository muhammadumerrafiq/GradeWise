import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-text-primary mb-1">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={twMerge(
            clsx(
              "w-full rounded bg-surface border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-colors shadow-sm",
              "focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent",
              "disabled:bg-gray-100 disabled:text-text-tertiary disabled:cursor-not-allowed",
              error && "border-status-error focus:ring-status-error focus:border-status-error",
              className
            )
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-status-error">{error}</p>}
        {!error && helperText && <p className="mt-1 text-xs text-text-secondary">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, rows = 3, ...props }, ref) => {
    const textareaId = id || props.name;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-text-primary mb-1">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          rows={rows}
          className={twMerge(
            clsx(
              "w-full rounded bg-surface border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-colors shadow-sm",
              "focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent",
              "disabled:bg-gray-100 disabled:text-text-tertiary disabled:cursor-not-allowed",
              error && "border-status-error focus:ring-status-error focus:border-status-error",
              className
            )
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-status-error">{error}</p>}
        {!error && helperText && <p className="mt-1 text-xs text-text-secondary">{helperText}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
