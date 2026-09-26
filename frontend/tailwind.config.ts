import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'marquee': 'marquee 20s linear infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-ring': 'pulse-ring 2.5s ease-out infinite',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in': 'fade-in 0.2s ease-out both',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(90,78,227,0.4)' },
          '70%': { boxShadow: '0 0 0 12px rgba(90,78,227,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(90,78,227,0)' },
        },
        skeleton: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          indigo: '#5A4EE3',
          'indigo-light': '#7267F2',
          cyan: '#3CE0D6',
          purple: '#8C52FF',
          accent: '#A5B4FC',
          teal: '#14B8A6',
          'teal-light': '#2DD4BF',
          amber: '#F59E0B',
          'amber-light': '#FBBF24',
        },
        surface: {
          DEFAULT: '#0F121A',
          secondary: '#1A1E27',
          tertiary: '#232833',
          border: '#2A303C',
        },
      },
      width: {
        sidebar: '280px',
        pinned: '360px',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
export default config;
