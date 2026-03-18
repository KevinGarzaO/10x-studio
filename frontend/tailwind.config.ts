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
        'brand-bg':      'var(--color-bg)',
        'brand-surface': 'var(--color-surface)',
        'brand-primary': 'var(--color-text-primary)',
        'brand-secondary':'var(--color-text-secondary)',
        'brand-accent':  'var(--color-accent)',
        'brand-border':  'var(--color-border)',
      },

    },
  },
  plugins: [],
}
export default config
