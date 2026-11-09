/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        panel: 'var(--panel)',
        'panel-raised': 'var(--panel-raised)',
        inset: 'var(--inset)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-alt': 'var(--accent-alt)',
        ink: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        input: '6px',
        card: '10px',
      },
      boxShadow: {
        soft: '0 6px 18px rgba(2, 6, 23, 0.45)',
        pop: '0 12px 32px rgba(2, 6, 23, 0.6)',
      },
      fontSize: {
        '2xs': '11px',
        xs: '12px',
        sm: '13px',
        base: '13.5px',
        md: '14px',
      },
    },
  },
  plugins: [],
};
