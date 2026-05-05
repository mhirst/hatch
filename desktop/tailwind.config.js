/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Palette pulled from monpaco's playful dark mode — chunky shapes on
      // near-black with bright primary accents. We keep the cream "paper" so
      // we can flip surfaces light when the moment calls for it.
      colors: {
        ink: "#1A1815",
        "ink-2": "#231F1B",   // raised surface
        "ink-3": "#2E2924",   // hairline against ink
        paper: "#F5F1EA",
        "paper-2": "#EAE3D5", // dimmer paper for muted text on dark
        ash: "#8C857C",       // mid-tone for captions
        cobalt: "#3D52E2",
        rose: "#F5B9C9",
        mustard: "#D4A82B",
        vermilion: "#E33627",
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
