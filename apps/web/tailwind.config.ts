import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 20px 70px rgba(0, 0, 0, 0.32)",
      },
    },
  },
  plugins: [],
};

export default config;
