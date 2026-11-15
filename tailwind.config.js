/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: ['./apps/*/index.html', './apps/*/src/**/*.{ts,tsx}', './packages/*/src/**/*.{ts,tsx}']
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
