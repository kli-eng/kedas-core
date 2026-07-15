/** @type {import('tailwindcss').Config} */
// KEDAS v3.0.2 — Tailwind con paleta institucional KLI
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta institucional KEDAS — azul KLI (#1e3a8a) y verde Olmué (#10B981)
        kedas: {
          primary:   "#1e3a8a",
          secondary: "#10B981",
          danger:    "#DC2626",
          warning:   "#F59E0B",
          neutral:   "#475569"
        }
      },
      fontFamily: {
        // Stack del sistema — sin Google Fonts (soberanía + offline)
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"]
      }
    }
  },
  plugins: []
};
