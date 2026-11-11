/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/sidepanel/**/*.{html,ts,tsx,js,jsx}",
    "./src/**/*.{html,ts,tsx,js,jsx}"
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#151f32',
          950: '#070d19',
        },
        sahayak: {
          deep: '#0f172a',
          surface: '#1e293b',
          card: 'rgba(30, 41, 59, 0.75)',
          border: '#334155',
          accent: '#38bdf8',
          text: '#f8fafc',
          muted: '#94a3b8',
        }
      }
    },
  },
  plugins: [],
}
