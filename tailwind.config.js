/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        icf: {
          green: '#15803D',
          greenLight: '#22C55E',
        },
      },
    },
  },
  plugins: [],
}
