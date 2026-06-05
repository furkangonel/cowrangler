/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/desktop/**/*.{tsx,ts,jsx,js,html}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0f0f0f',
          secondary: '#161616',
          tertiary: '#1c1c1c',
          hover: '#242424',
        },
        border: {
          DEFAULT: '#2a2a2a',
          subtle: '#1f1f1f',
        },
        text: {
          primary: '#f0f0f0',
          secondary: '#9a9a9a',
          muted: '#525252',
        },
        accent: {
          DEFAULT: '#e05c2a',
          hover: '#f06030',
          subtle: 'rgba(224,92,42,0.12)',
        },
        success: '#34d399',
        warning: '#fbbf24',
        error: '#f87171',
        info: '#60a5fa',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Cascadia Code',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        base: ['13px', '20px'],
        md: ['14px', '22px'],
        lg: ['15px', '22px'],
        xl: ['17px', '24px'],
        '2xl': ['20px', '28px'],
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
        pulse: 'pulse 1.5s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateY(4px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
      },
    },
  },
  plugins: [],
}
