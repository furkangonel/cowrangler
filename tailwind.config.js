// Co-Wrangler design system.
// Colours resolve to CSS custom properties (RGB triplets); the theme swaps via
// [data-theme]. The accent ramp is derived from the Co-Wrangler mark (#EC5A29).
// `<alpha-value>` Tailwind opacity modifier'larını (bg-accent/10 vb.) korur.
/** @type {import('tailwindcss').Config} */
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./src/desktop/**/*.{tsx,ts,jsx,js,html}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   withVar('--bg-primary'),
          secondary: withVar('--bg-secondary'),
          tertiary:  withVar('--bg-tertiary'),
          hover:     withVar('--bg-hover'),
          elevated:  withVar('--bg-elevated'),
        },
        border: {
          DEFAULT: withVar('--border'),
          subtle:  withVar('--border-subtle'),
          strong:  withVar('--border-strong'),
        },
        text: {
          primary:     withVar('--text-primary'),
          secondary:   withVar('--text-secondary'),
          muted:       withVar('--text-muted'),
          placeholder: withVar('--text-placeholder'),
        },
        accent: {
          DEFAULT: withVar('--accent'),
          hover:   withVar('--accent-hover'),
          press:   withVar('--accent-press'),
          fg:      withVar('--accent-fg'),
          text:    withVar('--accent-text'),
          subtle:  'rgb(var(--accent) / 0.12)',
        },
        brand: {
          DEFAULT: withVar('--brand'),
          bright:  withVar('--brand-bright'),
        },
        signal: withVar('--signal'),
        user: {
          bubble: withVar('--user-bubble-bg'),
          'bubble-border': withVar('--user-bubble-border'),
        },
        success: withVar('--success'),
        warning: withVar('--warning'),
        error: withVar('--error'),
        info: withVar('--info'),
      },
      fontFamily: {
        sans: [
          'SF Pro Rounded',
          'Inter',
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        serif: [
          'Charter',
          'ui-serif',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        base: ['13px', '20px'],
        md: ['14px', '22px'],
        lg: ['15px', '24px'],
        xl: ['17px', '26px'],
        '2xl': ['20px', '28px'],
        '3xl': ['26px', '34px'],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        sm:    '0 1px 2px rgb(0 0 0 / 0.05), 0 1px 3px rgb(0 0 0 / 0.04)',
        card:  '0 1px 3px rgb(0 0 0 / 0.05), 0 2px 6px rgb(0 0 0 / 0.06)',
        panel: '0 8px 30px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.06)',
        pop:   '0 8px 28px rgb(0 0 0 / 0.16), 0 2px 6px rgb(0 0 0 / 0.06)',
        accent: '0 3px 12px rgb(var(--accent) / 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.16s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
        'slide-up': 'slideUp 0.18s ease-out',
        pulse: 'pulse 1.5s ease-in-out infinite',
        blink: 'blink 1s step-end infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: 'translateY(4px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}
