import { createContext, useContext } from 'react'

// Split out from components/shell.tsx to avoid a circular import: shell.tsx
// pulls LeftSidebar/RightSidebar/etc. from components/community-hub.tsx,
// and community-hub.tsx's Feed needs useShell() — so the context itself
// can't live in either of those two files.
export interface ShellContextValue {
  user: any
  requestAuth: () => void
  search: string
  activeTag: string | null
  setActiveTag: (tag: string | null) => void
}

export const ShellContext = createContext<ShellContextValue>({
  user: null,
  requestAuth: () => {},
  search: '',
  activeTag: null,
  setActiveTag: () => {},
})

export const useShell = () => useContext(ShellContext)
