import { describe, it, expect, beforeEach } from 'vitest'
import { isSafeReturnPath, saveReturnTo, peekReturnTo, takeReturnTo, clearReturnTo } from '@/lib/return-to'

beforeEach(() => localStorage.clear())

describe('isSafeReturnPath', () => {
  it('accepts pages of our own site', () => {
    expect(isSafeReturnPath('/vacantes/backend-engineer-1')).toBe(true)
    expect(isSafeReturnPath('/post/abc?x=1#comentarios')).toBe(true)
    expect(isSafeReturnPath('/')).toBe(true)
  })

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    'vacantes/x',
    '',
    '/ok\nmalo',
    `/${'a'.repeat(600)}`,
  ])('refuses %j, which could send the person to another site', (path) => {
    expect(isSafeReturnPath(path)).toBe(false)
  })

  it('never returns to the signup pages themselves', () => {
    for (const path of ['/login', '/signup', '/onboarding', '/signup?x=1', '/onboarding/empresa']) {
      expect(isSafeReturnPath(path)).toBe(false)
    }
    expect(isSafeReturnPath('/login-help')).toBe(true)
  })

  it('refuses things that are not text', () => {
    expect(isSafeReturnPath(null)).toBe(false)
    expect(isSafeReturnPath(42)).toBe(false)
  })
})

describe('the saved return path', () => {
  it('is kept until the journey ends, then taken once', () => {
    saveReturnTo('/vacantes/mi-vacante')
    expect(peekReturnTo()).toBe('/vacantes/mi-vacante')
    expect(peekReturnTo()).toBe('/vacantes/mi-vacante')

    expect(takeReturnTo()).toBe('/vacantes/mi-vacante')
    expect(takeReturnTo()).toBeNull()
  })

  it('does not save an unsafe path', () => {
    saveReturnTo('https://evil.com')
    saveReturnTo('//evil.com')
    expect(peekReturnTo()).toBeNull()
  })

  it('forgets a path older than a day', () => {
    saveReturnTo('/vacantes/x', 1_000)
    expect(peekReturnTo(1_000 + 23 * 3600_000)).toBe('/vacantes/x')
    expect(peekReturnTo(1_000 + 25 * 3600_000)).toBeNull()
    expect(localStorage.getItem('avo_return_to')).toBeNull()
  })

  it('ignores a value someone planted in the storage', () => {
    localStorage.setItem('avo_return_to', JSON.stringify({ path: 'https://evil.com', savedAt: Date.now() }))
    expect(peekReturnTo()).toBeNull()

    localStorage.setItem('avo_return_to', 'esto no es json')
    expect(peekReturnTo()).toBeNull()
  })

  it('can be cleared', () => {
    saveReturnTo('/vacantes/x')
    clearReturnTo()
    expect(peekReturnTo()).toBeNull()
  })
})
