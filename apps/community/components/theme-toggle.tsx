'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, currentTheme, type Theme } from '../lib/theme'

/** Cambia entre el tema claro y el oscuro. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  // El tema real lo puso el script del <head> antes de pintar: aquí solo se lee.
  useEffect(() => setTheme(currentTheme()), [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => { applyTheme(next); setTheme(next) }}
      aria-label={next === 'dark' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      title={next === 'dark' ? 'Tema oscuro' : 'Tema claro'}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
