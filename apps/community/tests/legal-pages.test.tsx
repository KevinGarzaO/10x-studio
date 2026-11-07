import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PrivacyPage from '@/app/privacidad/page'
import TermsPage from '@/app/terminos/page'
import CookiesPage from '@/app/cookies/page'
import { LegalLinks, LEGAL_LINKS } from '@/components/legal-layout'

/**
 * Las páginas legales: se abren sin iniciar sesión (no tocan la sesión ni el servidor), traen su contenido completo y enlazan entre sí.
 */
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))

describe('legal pages', () => {
  it('the privacy notice says who is responsible, what is collected, who gets it, the rights and how to reach us', () => {
    render(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeTruthy()
    for (const heading of ['Quién es responsable', 'Qué datos recabamos', 'Para qué los usamos', 'Con quién compartimos', 'Tus derechos', 'Cuánto tiempo guardamos', 'Menores de edad', 'Cookies', 'Cambios']) {
      expect(screen.getByRole('heading', { level: 2, name: new RegExp(heading) })).toBeTruthy()
    }
    expect(screen.getAllByRole('link', { name: 'hola@avotalent.app' })[0].getAttribute('href')).toBe('mailto:hola@avotalent.app')
    expect(screen.getByText(/Transformateck S\.A\.S\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Política de cookies y medición' }).getAttribute('href')).toBe('/cookies')
  })

  it('names EVERY tool that measures or records visits (own measurement, Google Analytics and Clarity) and the providers that hold the data', () => {
    render(<PrivacyPage />)
    const text = document.body.textContent ?? ''
    for (const provider of ['Google Analytics', 'Microsoft Clarity', 'Supabase', 'Railway', 'Vercel', 'Resend', 'GitHub', 'LinkedIn']) expect(text).toContain(provider)
  })

  it('says that email clicks are tracked through Resend, what is kept and what is not, and that the activity score and the opt-out exist', () => {
    render(<PrivacyPage />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('los clics que haces en sus enlaces')
    expect(text).toContain('dominio de seguimiento de nuestro proveedor de correo (Resend)')
    expect(text).toContain('no guardamos tu dirección IP ni tu navegador')
    expect(text).toContain('puntuación interna')
    expect(text).toContain('Novedades e invitaciones de la comunidad')
  })

  it('the cookies page says email clicks are measured without a cookie of this site', () => {
    render(<CookiesPage />)
    expect(document.body.textContent).toContain('En los correos que te enviamos medimos los clics en sus enlaces')
  })

  it('says the truth about the CV: private by default, and when public anyone with the link can see it (even without an account)', () => {
    render(<PrivacyPage />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Es privado por defecto')
    expect(text).toContain('cualquier persona que tenga el enlace puede verlo, aunque no tenga cuenta')
    expect(text).not.toContain('no los visitantes sin cuenta')
  })

  it('the terms explain the account, the vacancies (45 days, we are not the employer), the community and the law, and point to privacy', () => {
    render(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Términos y condiciones' })).toBeTruthy()
    for (const heading of ['Qué es AvoTalent', 'Quién puede usarla', 'Tu cuenta', 'Las vacantes', 'La comunidad', 'Limitación de responsabilidad', 'Ley aplicable']) {
      expect(screen.getByRole('heading', { level: 2, name: new RegExp(heading) })).toBeTruthy()
    }
    expect(document.body.textContent).toContain('45 días')
    // enlaza al aviso de privacidad en el texto (y otra vez en el pie)
    expect(screen.getAllByRole('link', { name: 'Aviso de privacidad' }).map(link => link.getAttribute('href'))).toEqual(['/privacidad', '/privacidad'])
  })

  it('the cookies page lists what is used, with names, durations and who manages it, including Google Analytics and Clarity', () => {
    render(<CookiesPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Política de cookies y medición' })).toBeTruthy()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows.length).toBeGreaterThanOrEqual(7) // encabezado + 6 o más
    const text = table.textContent ?? ''
    for (const name of ['_avo_cid', 'avo_attribution', '_ga', '_clck', 'avocado_token']) expect(text).toContain(name)
    expect(text).toContain('Google Analytics')
    expect(text).toContain('Microsoft Clarity')
  })

  it('every page ends with the three legal links', () => {
    for (const Page of [PrivacyPage, TermsPage, CookiesPage]) {
      const { unmount } = render(<Page />)
      const nav = screen.getByRole('navigation', { name: 'Legales' })
      expect(within(nav).getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(LEGAL_LINKS.map(link => link.href))
      unmount()
    }
  })
})

describe('LegalLinks', () => {
  it('points to the three public pages', () => {
    render(<LegalLinks />)
    expect(screen.getByRole('link', { name: 'Aviso de privacidad' }).getAttribute('href')).toBe('/privacidad')
    expect(screen.getByRole('link', { name: 'Términos y condiciones' }).getAttribute('href')).toBe('/terminos')
    expect(screen.getByRole('link', { name: 'Cookies y medición' }).getAttribute('href')).toBe('/cookies')
  })
})
