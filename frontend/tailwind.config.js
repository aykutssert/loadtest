/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f0f13',
        card: '#1a1a24',
        border: '#2a2a3a',
        accent: '#7c3aed',
        'accent-hover': '#6d28d9',
      },
    },
  },
  plugins: [],
}
