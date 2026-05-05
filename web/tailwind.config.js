/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Palette pulled from monpaco's playful dark mode — chunky shapes on
      // near-black with bright primary accents. Mirrors desktop/tailwind.config.js
      // so the browser UI and the Electron renderer share one design language.
      colors: {
        ink: "#1A1815",
        "ink-2": "#231F1B",
        "ink-3": "#2E2924",
        paper: "#F5F1EA",
        "paper-2": "#EAE3D5",
        ash: "#8C857C",
        cobalt: "#3D52E2",
        rose: "#F5B9C9",
        mustard: "#D4A82B",
        vermilion: "#E33627",
        // Legacy aliases so old class names keep working until everything's
        // ported over.
        line: "#2E2924",
        clay: "#E33627",
        moss: "#3D52E2",
      },
      fontFamily: {
        serif: ['"EB Garamond"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tight: "-0.02em",
      },
      borderRadius: {
        soft: "12px",
        pill: "999px",
      },
    },
  },
  plugins: [],
};
