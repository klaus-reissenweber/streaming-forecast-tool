import type { Config } from "tailwindcss";

/**
 * Instrument Edition design tokens.
 * Consumed via @config in app/globals.css (Tailwind v4).
 */
const config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#EDEEF1",
        "canvas-subtle": "#F4F5F7",
        surface: "#FFFFFF",
        border: {
          DEFAULT: "#E2E6EB",
          subtle: "#ECEEF2",
        },
        foreground: "#12151A",
        secondary: "#545B66",
        muted: "#868E98",
        disabled: "#555555",
        accent: {
          DEFAULT: "#C8E600",
          hover: "#B3CF00",
          readable: "#5A6600",
          tint: "#F7FCE8",
          border: "#DFEBA3",
        },
        semantic: {
          positive: "#1F6B52",
          "positive-bg": "#ECF5F1",
          warning: "#8A6400",
          "warning-bg": "#F8F3E4",
          negative: "#9B2335",
          "negative-bg": "#F9ECEE",
          info: "#1565A8",
          "info-bg": "#ECF2FA",
          neutral: "#545B66",
        },
        projected: "#1565A8",
        chart: {
          locked: "#8FA800",
          projected: "#1565A8",
          actual: "#12151A",
          grid: "#ECEEF2",
          axis: "#868E98",
        },
        dot: "#C5CAD3",
        bracket: {
          bg: "#F0F2F5",
          text: "#545B66",
        },
      },
      fontFamily: {
        serif: [
          "var(--font-source-serif)",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        sans: [
          "var(--font-plex-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-plex-mono)",
          "ui-monospace",
          "monospace",
        ],
      },
      fontSize: {
        "release-title": ["1.75rem", { lineHeight: "1.2", fontWeight: "600" }],
        section: ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }],
        "metric-value": ["1.75rem", { lineHeight: "1.1", fontWeight: "600" }],
        label: [
          "0.6875rem",
          { lineHeight: "1.2", fontWeight: "500", letterSpacing: "0.06em" },
        ],
        caption: ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5", fontWeight: "400" }],
      },
      borderRadius: {
        instrument: "4px",
        tag: "2px",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
      },
      transitionDuration: {
        150: "150ms",
        200: "200ms",
        250: "250ms",
        300: "300ms",
        400: "400ms",
        600: "600ms",
      },
      keyframes: {
        "instrument-fade-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "instrument-rule-grow": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        "instrument-scanline-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "instrument-recompute-flash": {
          "0%": { backgroundColor: "#F7FCE8" },
          "100%": { backgroundColor: "#FFFFFF" },
        },
        "instrument-flag-in": {
          from: { opacity: "0", transform: "translateY(3px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "instrument-chart-grid-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "instrument-legend-tag-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "instrument-fade-up":
          "instrument-fade-up 250ms var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)) both",
        "instrument-rule-grow":
          "instrument-rule-grow 200ms var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) 100ms both",
        "instrument-scanline-in":
          "instrument-scanline-in 200ms var(--ease-in-out, cubic-bezier(0.4, 0, 0.2, 1)) both",
        "instrument-recompute-flash":
          "instrument-recompute-flash 400ms var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)) both",
        "instrument-flag-in":
          "instrument-flag-in 200ms var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)) both",
        "instrument-chart-grid-in":
          "instrument-chart-grid-in 300ms var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) both",
        "instrument-legend-tag-in":
          "instrument-legend-tag-in 200ms var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1)) both",
      },
    },
  },
} satisfies Config;

export default config;
