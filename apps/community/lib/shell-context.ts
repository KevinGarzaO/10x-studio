import { createContext, useContext } from 'react'

// Split out from components/shell.tsx to avoid a circular import: shell.tsx
// pulls LeftSidebar/RightSidebar/etc. from components/community-hub.tsx,
// and community-hub.tsx's Feed needs useShell() — so the context itself
// can't live in either of those two files.
/**
 * Para qué se pide registrarse. Con 'vacancy' el aviso habla de la vacante que se está
 * viendo y promete volver a ella al terminar. Sin opciones es el aviso general.
 */
export interface AuthRequest {
  variant: 'vacancy'
  /** Lo que se muestra como asunto: el título de la vacante y su empresa. */
  subject?: string
}

export interface ShellContextValue {
  user: any
  /** false mientras se confirma la sesión: evita avisar de registro a quien ya tiene cuenta. */
  userLoaded: boolean
  /** Se usa también como onClick directo, así que acepta (e ignora) un evento. */
  requestAuth: (request?: AuthRequest | unknown) => void
  search: string
  activeTag: string | null
  setActiveTag: (tag: string | null) => void
}

export const ShellContext = createContext<ShellContextValue>({
  user: null,
  userLoaded: false,
  requestAuth: () => {},
  search: '',
  activeTag: null,
  setActiveTag: () => {},
})

export const useShell = () => useContext(ShellContext)
