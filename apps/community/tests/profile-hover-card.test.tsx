import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileHoverCard, resetProfileCardCache } from '@/components/profile-hover-card'

vi.mock('next/link', () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }))

const requested: string[] = []

const userCard = { kind: 'user', name: 'Ana López', photo_url: null, bio: 'Construyo APIs en Node.', location: 'Monterrey, México', role_category: 'backend', seniority: 'senior', joined_at: '2026-10-05T12:00:00Z' }
const companyCard = { kind: 'company', name: 'Acme', photo_url: null, bio: null, location: 'Remoto', open_vacancies: 7 }

beforeEach(() => {
  requested.length = 0
  resetProfileCardCache()
  global.fetch = vi.fn(async (url: string) => {
    requested.push(String(url))
    if (String(url).includes('/cards/company/')) return { ok: true, json: async () => ({ card: companyCard }) }
    if (String(url).includes('/cards/user/')) return { ok: true, json: async () => ({ card: userCard }) }
    return { ok: false, json: async () => ({}) }
  }) as unknown as typeof fetch
})

const person = () => (
  <ProfileHoverCard kind="user" id="ana" name="Ana López" href="/users/ana">
    <a href="/users/ana">Ana López</a>
  </ProfileHoverCard>
)

describe('la tarjeta al pasar el cursor', () => {
  it('no sale hasta pasar el cursor, y entonces muestra a la persona con su perfil', async () => {
    render(person())
    expect(screen.queryByRole('tooltip')).toBeNull()

    await userEvent.hover(screen.getByText('Ana López'))

    const card = await screen.findByRole('tooltip')
    expect(await screen.findByText('Construyo APIs en Node.')).toBeInTheDocument()
    expect(card).toHaveTextContent('Desarrollo Backend')
    expect(card).toHaveTextContent('Monterrey, México')
    expect(card).toHaveTextContent('5 de octubre de 2026')
    expect(screen.getByRole('link', { name: 'Ver perfil' })).toHaveAttribute('href', '/users/ana')
  })

  it('pide los datos públicos de esa persona una sola vez, aunque pases el cursor muchas veces', async () => {
    render(person())

    const name = screen.getByRole('link', { name: 'Ana López' })
    await userEvent.hover(name)
    await screen.findByRole('tooltip')
    await userEvent.unhover(name)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
    await userEvent.hover(name)
    await screen.findByRole('tooltip')

    expect(requested.filter(url => url.includes('/cards/user/ana'))).toHaveLength(1)
  })

  it('en una empresa muestra sus vacantes abiertas y lleva a "Ver empresa"', async () => {
    render(
      <ProfileHoverCard kind="company" id="acme" name="Acme" href="/empresas/acme">
        <a href="/empresas/acme">Acme</a>
      </ProfileHoverCard>,
    )

    await userEvent.hover(screen.getByText('Acme'))

    const card = await screen.findByRole('tooltip')
    await waitFor(() => expect(card).toHaveTextContent('Vacantes abiertas7'))
    expect(screen.getByRole('link', { name: 'Ver empresa' })).toHaveAttribute('href', '/empresas/acme')
    expect(requested[0]).toContain('/cards/company/acme?name=Acme')
  })

  it('también sale al enfocar con el teclado', async () => {
    render(person())

    fireEvent.focus(screen.getByText('Ana López').closest('.hover-anchor')!)

    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it('sin quién es (por ejemplo el equipo) no hay tarjeta ni consulta', async () => {
    render(<ProfileHoverCard kind="user" id={null} name="AvoTalent" href={null}><span>AvoTalent</span></ProfileHoverCard>)

    await userEvent.hover(screen.getByText('AvoTalent'))
    await new Promise(resolve => setTimeout(resolve, 400))

    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(requested).toHaveLength(0)
  })

  it('si la consulta falla muestra lo que ya se sabe (nombre y botón), sin romperse', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    render(person())

    await userEvent.hover(screen.getByText('Ana López'))

    const card = await screen.findByRole('tooltip')
    expect(card).toHaveTextContent('Ana López')
    expect(screen.getByRole('link', { name: 'Ver perfil' })).toBeInTheDocument()
  })
})
