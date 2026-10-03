import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "xs" | "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", icon, children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors rounded select-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent disabled:opacity-50 disabled:pointer-events-none";

    const variantStyles = {
      primary: "bg-accent text-white hover:bg-accent-hover shadow-sm border border-transparent",
      secondary: "bg-surface text-text-primary border border-border hover:bg-background shadow-sm",
      ghost: "bg-transparent text-text-secondary hover:text-text-primary hover:bg-background",
      danger: "bg-status-error text-white hover:bg-red-700 shadow-sm border border-transparent",
      success: "bg-status-success text-white hover:bg-green-700 shadow-sm border border-transparent",
    };

    const sizeStyles = {
      xs: "text-xs px-2 py-1 gap-1",
      sm: "text-sm px-2.5 py-1.5 gap-1.5",
      md: "text-sm px-4 py-2 gap-2",
      lg: "text-base px-5 py-2.5 gap-2.5",
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={twMerge(clsx(baseStyles, variantStyles[variant], sizeStyles[size], className))}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
