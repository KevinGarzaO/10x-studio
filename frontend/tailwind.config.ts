import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        'brand-bg':      'var(--background)',
        'brand-surface': 'var(--card)',
        'brand-primary': 'var(--foreground)',
        'brand-secondary':'var(--muted-foreground)',
        'brand-accent':  'var(--accent)',
        'brand-border':  'var(--border)',
        'brand-nav-bg':  'var(--sidebar-bg)',
        'brand-nav-border': 'var(--sidebar-bg)',
      },

    },
  },
  plugins: [],
}
export default config
