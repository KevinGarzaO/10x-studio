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
        ink:    '#37352f',
        muted:  '#9b9a97',
        border: '#e9e9e7',
        hover:  '#f1f1ef',
        cream:  '#e9e9e7',
        paper:  '#f7f7f5',
        sidebar:'#191919',
        topbar: '#191919',
      },
    },
  },
  plugins: [],
}
export default config
