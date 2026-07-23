import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          pink: '#FD267A',
          orange: '#FF6036',
          dark: '#0F0F14',
          surface: '#1A1A22',
        },
        like: '#31D0AA',
        nope: '#FF5864',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pop-in': 'pop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
