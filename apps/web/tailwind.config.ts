import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--panel) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        line: "rgb(var(--border) / <alpha-value>)",
        control: "rgb(var(--control) / <alpha-value>)",
        slate: {
          950: "#0f1115",
          900: "#15181e",
          800: "#343c48",
          700: "#677587",
          600: "#8c99aa",
          500: "#8c99aa",
          400: "#aab4c1",
          300: "#c4cbd4",
          200: "#e2e6ec",
          100: "#f1f3f5",
        },
        cyan: { 300: "#84b9f5", 200: "#b0d2fa" },
      },
      boxShadow: { panel: "0 16px 48px rgba(0,0,0,0.24)" },
    },
  },
  plugins: [],
};
export default config;
