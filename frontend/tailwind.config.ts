import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        bg: "#0f0f0f",
        surface: "#1a1a1a",
        "app-border": "#2a2a2a",
        accent: "#6366f1",
        "accent-hover": "#4f46e5",
      },
    },
  },
  plugins: [],
};
export default config;
