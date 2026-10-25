import { describe, it, expect } from 'vitest'
import { isBotUserAgent } from '../../services/analytics/bots'

describe('isBotUserAgent', () => {
  it('lets real browsers through', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36')).toBe(false)
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(isBotUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36')).toBe(false)
  })

  it('catches search engines, link previews, headless browsers and scripts', () => {
    for (const agent of [
      'Googlebot/2.1', 'bingbot/2.0', 'Mozilla/5.0 HeadlessChrome/124.0', 'facebookexternalhit/1.1', 'LinkedInBot/1.0',
      'Slackbot-LinkExpanding', 'python-requests/2.31', 'curl/8.4.0', 'Lighthouse', 'Mozilla/5.0 (compatible; UptimeRobot/2.0)',
      'node-fetch/1.0', 'Mozilla/5.0 (compatible; GPTBot/1.0)', 'WhatsApp/2.23',
    ]) expect(isBotUserAgent(agent), agent).toBe(true)
  })

  it('treats a missing identification as not a person', () => {
    expect(isBotUserAgent(undefined)).toBe(true)
    expect(isBotUserAgent(null)).toBe(true)
    expect(isBotUserAgent('   ')).toBe(true)
  })
})
