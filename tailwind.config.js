/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta da ICF Energy: verde, azul-marinho e cinza claro.
        icf: {
          green: '#01C38E',
          greenLight: '#01C38E',
          greenDark: '#00805F',
          navy: '#132D46',
          gray: '#F4F4F4',
        },
      },
    },
  },
  plugins: [],
}
