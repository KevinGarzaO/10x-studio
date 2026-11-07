import { describe, it, expect } from 'vitest'
import { detectInAppBrowser } from '@/lib/in-app-browser'

describe('detectInAppBrowser', () => {
  it('spots the LinkedIn app (iOS marks the User-Agent, Android shows up as the referrer)', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [LinkedInApp]/9.30', '')).toBe('linkedin')
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36', 'android-app://com.linkedin.android')).toBe('linkedin')
  })
  it('spots the other apps and a generic Android WebView', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]', '')).toBe('facebook')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0', '')).toBe('instagram')
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', '')).toBe('other')
  })
  it('does not call a normal browser an in-app one, even when the person came from a LinkedIn link', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36', 'https://www.linkedin.com/')).toBeNull()
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1', 'https://lnkd.in/x')).toBeNull()
  })
})
