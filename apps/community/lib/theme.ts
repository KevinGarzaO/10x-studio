/**
 * Tema claro u oscuro. El claro es el de base; la elección de la persona se guarda en el navegador
 * y se aplica antes de pintar (ver THEME_SCRIPT), para que la página no parpadee.
 */
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'avotalent_theme'

/** Se inserta en <head>: aplica el tema guardado antes del primer pintado. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='dark')t='light';var r=document.documentElement;r.setAttribute('data-theme',t);r.classList.toggle('dark',t==='dark')}catch(e){document.documentElement.setAttribute('data-theme','light')}`

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Sin almacenamiento el cambio vale solo para esta visita.
  }
}
