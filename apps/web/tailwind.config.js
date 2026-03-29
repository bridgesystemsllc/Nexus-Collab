/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        nexus: {
          base: '#FFFFFF',
          surface: '#F7F6F3',
          elevated: '#FFFFFF',
          accent: '#2F80ED',
          'accent-hover': '#1A6FDB',
          'accent-light': '#EBF3FE',
          'accent-secondary': '#7C3AED',
          'accent-secondary-light': '#F3EEFE',
          success: '#0F7B6C',
          'success-light': '#E6F5F2',
          warning: '#D97706',
          'warning-light': '#FEF7E6',
          danger: '#EB5757',
          'danger-light': '#FDE8E8',
          info: '#2F80ED',
          'info-light': '#EBF3FE',
        },
      },
      fontFamily: {
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
