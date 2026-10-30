import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState, ListSkeleton, DetailSkeleton } from '@/components/skeletons'

describe('estados vacíos y esqueletos', () => {
  it('un estado vacío dice qué pasa y ofrece una sola acción', () => {
    render(<EmptyState icon={<i />} title="Aún no guardas ninguna vacante" text="Usa el botón Guardar." action={{ href: '/', label: 'Ver vacantes' }} />)
    expect(screen.getByText('Aún no guardas ninguna vacante')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver vacantes' })).toHaveAttribute('href', '/')
  })

  it('sin acción no pinta ningún enlace', () => {
    render(<EmptyState icon={<i />} title="Nada" text="Intenta más tarde." />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('los esqueletos avisan a lectores de pantalla que están cargando', () => {
    render(<><ListSkeleton rows={2} label="Cargando tus avisos" /><DetailSkeleton label="Cargando la vacante" /></>)
    expect(screen.getByRole('status', { name: 'Cargando tus avisos' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status', { name: 'Cargando la vacante' })).toBeTruthy()
  })
})
