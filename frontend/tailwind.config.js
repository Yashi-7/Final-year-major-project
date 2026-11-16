/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        agri: {
          50: '#f2f9f0',
          100: '#e0f0db',
          200: '#c2e0b6',
          300: '#9bcb8b',
          400: '#63ad57',
          500: '#2f8f3f',
          600: '#24732f',
          700: '#1c5c25',
          800: '#154a1d',
          900: '#0f3616',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 54, 22, 0.05), 0 4px 12px rgba(15, 54, 22, 0.05)',
      },
    },
  },
  plugins: [],
};
