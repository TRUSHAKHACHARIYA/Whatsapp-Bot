/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        green: {
          50: "#f0fbf5",
          100: "#dcf5e7",
          200: "#bcead0",
          300: "#8dd8b0",
          400: "#57be88",
          500: "#25D366",
          600: "#1ebe5d",
          700: "#0f6e56",
          800: "#0d5a45",
          900: "#0b4b39",
        },
      },
    },
  },
  plugins: [],
};
