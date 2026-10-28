import { describe, it, expect } from 'vitest'

import { renderProfileReminder } from '../../services/email/templates/profile-reminder'
import { exclusionFor, firstName, maskEmail, MIN_ACCOUNT_AGE_HOURS, type AudienceUser } from '../../services/email/profile-reminder'
import { trackedLink } from '../../services/email/links'

const NOW = new Date('2026-10-27T18:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString()

const person = (patch: Partial<AudienceUser> = {}): AudienceUser => ({
  id: 'u1', email: 'ana@example.com', display_name: 'Ana Pérez', name: null, username: 'ana', provider: 'email',
  user_kind: 'user', is_test_account: false, is_scraper_profile: false, profile_completed: false, email_opt_out: false,
  created_at: hoursAgo(72), ...patch,
})

describe('quién recibe el recordatorio', () => {
  it('una persona real con el perfil incompleto, con correo y más de un día de antigüedad, sí', () => {
    expect(exclusionFor(person(), new Set(), NOW)).toBeNull()
  })

  it.each([
    ['perfil completo', { profile_completed: true }, 'completo'],
    ['cuenta de prueba', { is_test_account: true }, 'prueba-o-scraper'],
    ['perfil del scraper', { is_scraper_profile: true }, 'prueba-o-scraper'],
    ['equipo', { user_kind: 'superadmin' }, 'equipo-o-empresa'],
    ['empresa', { user_kind: 'company' }, 'equipo-o-empresa'],
    ['sin correo', { email: null }, 'sin-correo'],
    ['correo mal escrito', { email: 'no-es-un-correo' }, 'sin-correo'],
    ['se dio de baja', { email_opt_out: true }, 'dio-de-baja'],
  ] as const)('no: %s', (_label, patch, reason) => {
    expect(exclusionFor(person(patch as Partial<AudienceUser>), new Set(), NOW)).toBe(reason)
  })

  it('no a quien se registró hace menos de un día, para no interrumpir a quien lo está llenando', () => {
    expect(exclusionFor(person({ created_at: hoursAgo(MIN_ACCOUNT_AGE_HOURS - 1) }), new Set(), NOW)).toBe('muy-reciente')
    expect(exclusionFor(person({ created_at: hoursAgo(MIN_ACCOUNT_AGE_HOURS + 1) }), new Set(), NOW)).toBeNull()
  })

  it('no a quien ya lo recibió: una sola vez por persona', () => {
    expect(exclusionFor(person(), new Set(['u1']), NOW)).toBe('ya-enviado')
  })

  it('enmascara el correo y toma el primer nombre', () => {
    expect(maskEmail('ana.perez@gmail.com')).toBe('a*****@gmail.com')
    expect(firstName(person())).toBe('Ana')
    expect(firstName(person({ display_name: null, name: null, username: 'ana_dev' }))).toBe('ana_dev')
  })
})

describe('el correo', () => {
  const vacancy = { title: 'Frontend Engineer, Ads', meta: 'Reddit • Remoto • Semi Senior', url: 'https://avotalent.app/vacantes/x?utm_source=email', label: 'popular' as const }
  const data = { name: 'Ana', completeProfileUrl: 'https://avotalent.app/onboarding?utm_source=email', vacancy, openVacancies: 443 }

  it('lleva el nombre, la vacante, las cifras reales y el enlace para completar el perfil', () => {
    const { html, text, subject } = renderProfileReminder(data)
    expect(subject).toMatch(/hacen match contigo/)
    expect(html).toContain('Ana')
    expect(html).toContain('Frontend Engineer, Ads')
    expect(html).toContain('La vacante más popular')
    expect(html).toContain('las otras 442 vacantes abiertas')
    expect(html).toContain('35 %')
    expect(html).toContain('onboarding?utm_source=email')
    expect(html).toContain('Es un único recordatorio')
    expect(html).not.toContain('unsubscribe')
    expect(text).toContain('onboarding?utm_source=email')
  })

  it('si aún no hay datos de popularidad no dice "popular"', () => {
    const { html } = renderProfileReminder({ ...data, vacancy: { ...vacancy, label: 'reciente' } })
    expect(html).toContain('Vacante reciente')
    expect(html).not.toContain('La vacante más popular')
  })

  it('escapa lo que viene de datos (nombre y vacante): nada se interpreta como HTML', () => {
    const { html } = renderProfileReminder({ ...data, name: '<script>alert(1)</script>', vacancy: { ...vacancy, title: '<img src=x onerror=alert(1)>' } })
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
  })

  it('con una sola vacante abierta no habla de "otras"', () => {
    expect(renderProfileReminder({ ...data, openVacancies: 1 }).html).toContain('con esta vacante')
  })

  it('los enlaces del sitio van marcados para medirlos en el panel', () => {
    const link = new URL(trackedLink('/onboarding', 'perfil-pendiente', 'boton-completar'))
    expect(link.searchParams.get('utm_source')).toBe('email')
    expect(link.searchParams.get('utm_medium')).toBe('recordatorio')
    expect(link.searchParams.get('utm_campaign')).toBe('perfil-pendiente')
    expect(link.searchParams.get('utm_content')).toBe('boton-completar')
  })
})
