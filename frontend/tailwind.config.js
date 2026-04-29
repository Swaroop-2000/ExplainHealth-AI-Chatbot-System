module.exports = {
  darkMode: "class",
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Login page colors
        background: "#0d1726",
        primary: "#137fec",

        // Dashboard additional colors
        "background-light": "#f6f7f8",
        "background-dark": "#101922",
        "surface-dark": "#192633",
        "muted-dark": "#92adc9",
      },

      boxShadow: {
        glow: "0 0 25px rgba(56,133,255,0.45)",
      },

      borderRadius: {
        xl: "0.75rem",
        lg: "0.5rem",
        full: "9999px",
      },

      backdropBlur: {
        xl: "18px",
      },

      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"), // optional but recommended
    require("@tailwindcss/container-queries"), // optional
  ],
};

