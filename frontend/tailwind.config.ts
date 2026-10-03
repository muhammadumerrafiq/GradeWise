import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#FAFAFA",
        surface: "#FFFFFF",
        border: "#E5E7EB",

        text: {
          primary: "#111827",
          secondary: "#6B7280",
          tertiary: "#9CA3AF",
        },

        accent: {
          DEFAULT: "#2563EB",
          light: "#EFF6FF",
          hover: "#1D4ED8",
        },

        status: {
          success: "#16A34A",
          "success-bg": "#F0FDF4",
          warning: "#D97706",
          "warning-bg": "#FFFBEB",
          error: "#DC2626",
          "error-bg": "#FEF2F2",
          info: "#2563EB",
          "info-bg": "#EFF6FF",
        },

        score: {
          high: "#16A34A",
          mid: "#D97706",
          low: "#DC2626",
        },
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },

      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        xl: ["1.5rem", { lineHeight: "2rem" }],
        "2xl": ["2rem", { lineHeight: "2.5rem" }],
      },

      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)",
      },

      borderRadius: {
        DEFAULT: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
      },
    },
  },
  plugins: [],
};

export default config;
