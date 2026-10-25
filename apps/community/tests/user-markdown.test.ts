import { describe, it, expect } from 'vitest'
import { excerptOf, renderUserMarkdown } from '@/lib/user-markdown'

describe('renderUserMarkdown: normal text', () => {
  it('renders markdown', () => {
    const html = renderUserMarkdown('## Título\n\nUn **texto** con `código` y una lista:\n\n- uno\n- dos')

    expect(html).toContain('<h2')
    expect(html).toContain('<strong>texto</strong>')
    expect(html).toContain('<code>código</code>')
    expect(html).toContain('<li>uno</li>')
  })

  it('keeps line breaks', () => {
    expect(renderUserMarkdown('línea uno\nlínea dos')).toContain('<br>')
  })

  it('opens links in another tab, without giving the page to the link', () => {
    const html = renderUserMarkdown('[AvoTalent](https://avotalent.app)')
    expect(html).toContain('href="https://avotalent.app"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"')
  })
})

describe('renderUserMarkdown: what a malicious person could write', () => {
  it('does not run scripts: it shows them as text', () => {
    const html = renderUserMarkdown('hola <script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('does not let raw html through, event handlers included', () => {
    const html = renderUserMarkdown('<img src=x onerror="alert(1)"> <a href="javascript:alert(1)" onclick="x()">clic</a>')
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<a /i)
    expect(html).toContain('&lt;img')
  })

  it('drops javascript: and data: links but keeps their text', () => {
    const js = renderUserMarkdown('[toca](javascript:alert(1))')
    expect(js).not.toContain('javascript:')
    expect(js).toContain('toca')

    expect(renderUserMarkdown('[x](data:text/html;base64,AAAA)')).not.toContain('data:')
    expect(renderUserMarkdown('[x](  JaVaScRiPt:alert(1))')).not.toMatch(/javascript:/i)
  })

  it('only allows images over https', () => {
    expect(renderUserMarkdown('![logo](https://cdn.test/a.png)')).toContain('<img src="https://cdn.test/a.png"')
    expect(renderUserMarkdown('![logo](http://cdn.test/a.png)')).not.toContain('<img')
    expect(renderUserMarkdown('![logo](javascript:alert(1))')).not.toContain('<img')
  })

  it('escapes quotes in attributes so they cannot be closed early', () => {
    const html = renderUserMarkdown('[x](https://a.test/"onmouseover="alert(1))')
    expect(html).not.toMatch(/onmouseover="alert/)
  })

  it('does not run an iframe or a style block', () => {
    const html = renderUserMarkdown('<iframe src="https://evil.test"></iframe><style>body{display:none}</style>')
    expect(html).not.toMatch(/<iframe|<style/i)
  })
})

describe('excerptOf', () => {
  it('turns markdown into a short plain text', () => {
    expect(excerptOf('## Hola\n\nUn **texto** con [un enlace](https://a.test) y `código`.', 200)).toBe('Hola Un texto con un enlace y código.')
  })

  it('cuts long text with an ellipsis', () => {
    const text = excerptOf('palabra '.repeat(100), 40)
    expect(text.length).toBeLessThanOrEqual(41)
    expect(text.endsWith('…')).toBe(true)
  })

  it('survives empty input', () => {
    expect(excerptOf(null)).toBe('')
    expect(excerptOf('')).toBe('')
  })
})
