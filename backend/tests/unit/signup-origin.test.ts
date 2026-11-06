import { describe, it, expect } from 'vitest'
import { pickSignupOrigin, type OriginSession } from '../../services/analytics/signup-origin'

const session = (patch: Partial<OriginSession> & { created_at: string }): OriginSession => ({
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, referrer_host: null, entry_path: '/', ...patch,
})

describe('pickSignupOrigin', () => {
  const registeredAt = '2026-11-04T18:00:00Z'

  it('takes the last marked link opened before registering (the same "last origin" the site uses)', () => {
    const origin = pickSignupOrigin([
      session({ created_at: '2026-11-04T10:00:00Z', utm_source: 'email', utm_medium: 'invitacion', utm_campaign: 'invitacion-1', entry_path: '/' }),
      session({ created_at: '2026-11-04T17:50:00Z', utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'vacante-auto', utm_content: 'backend-stripe', entry_path: '/vacantes/backend-stripe' }),
      // una visita posterior sin enlace marcado no lo reemplaza
      session({ created_at: '2026-11-04T17:55:00Z', entry_path: '/auth/callback' }),
    ], registeredAt)
    expect(origin).toEqual({ signup_source: 'linkedin', signup_medium: 'social', signup_campaign: 'vacante-auto', signup_content: 'backend-stripe', signup_referrer: null, signup_landing_path: '/vacantes/backend-stripe' })
  })

  it('counts the session of the registration itself, but not a marked link opened days later', () => {
    expect(pickSignupOrigin([session({ created_at: '2026-11-04T18:02:00Z', utm_source: 'linkedin' })], registeredAt)?.signup_source).toBe('linkedin')
    expect(pickSignupOrigin([session({ created_at: '2026-11-06T09:00:00Z', utm_source: 'linkedin' })], registeredAt)).toBeNull()
  })

  it('is null when no session carried a marked link', () => {
    expect(pickSignupOrigin([], registeredAt)).toBeNull()
    expect(pickSignupOrigin([session({ created_at: '2026-11-04T10:00:00Z' })], registeredAt)).toBeNull()
  })
})
