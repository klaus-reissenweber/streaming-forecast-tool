import type { Config } from "tailwindcss";

/**
 * Forecast design tokens.
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
        canvas: "var(--color-canvas)",
        "canvas-subtle": "var(--color-canvas-subtle)",
        card: "var(--color-card)",
        surface: "var(--color-surface)",
        border: {
          DEFAULT: "var(--color-border)",
          subtle: "var(--color-border-subtle)",
        },
        foreground: "var(--color-foreground)",
        secondary: "var(--color-secondary)",
        mute: "var(--color-mute)",
        muted: "var(--color-muted)",
        disabled: "var(--color-disabled)",
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          readable: "var(--color-accent-readable)",
          tint: "var(--color-accent-tint)",
          border: "var(--color-accent-border)",
        },
        semantic: {
          positive: "var(--color-semantic-positive)",
          "positive-bg": "var(--color-semantic-positive-bg)",
          warning: "var(--color-semantic-warning)",
          "warning-bg": "var(--color-semantic-warning-bg)",
          negative: "var(--color-semantic-negative)",
          "negative-bg": "var(--color-semantic-negative-bg)",
          info: "var(--color-semantic-info)",
          "info-bg": "var(--color-semantic-info-bg)",
          neutral: "var(--color-semantic-neutral)",
        },
        projected: "var(--color-projected)",
        chart: {
          locked: "var(--color-chart-locked)",
          projected: "var(--color-chart-projected)",
          actual: "var(--color-chart-actual)",
          grid: "var(--color-chart-grid)",
          axis: "var(--color-chart-axis)",
        },
        bracket: {
          bg: "var(--color-bracket-bg)",
          text: "var(--color-bracket-text)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        "release-title": ["1.75rem", { lineHeight: "1.2", fontWeight: "600" }],
        section: ["1.0625rem", { lineHeight: "1.3", fontWeight: "600" }],
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
