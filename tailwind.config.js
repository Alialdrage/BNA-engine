
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: "#00D4FF",
      },
      boxShadow: {
        neon: "0 0 30px rgba(0,212,255,0.5)",
        "neon-strong": "0 0 50px rgba(0,212,255,0.8)",
      }
    },
  },
  plugins: [],
}
