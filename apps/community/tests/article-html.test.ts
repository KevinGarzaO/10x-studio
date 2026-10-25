import { describe, it, expect } from 'vitest'
import { excerptRepeatsBody, isCapsHeading, promoteCapsHeadings } from '@/lib/article-html'

describe('isCapsHeading', () => {
  it('recognizes a short line in capitals as a subtitle', () => {
    expect(isCapsHeading('¿CUÁL ES EL PLOT TWIST?')).toBe(true)
    expect(isCapsHeading('LA NOTICIA QUE ESTABAS ESPERANDO')).toBe(true)
  })

  it('does not take a normal sentence, a long line or a number for a subtitle', () => {
    expect(isCapsHeading('Esto no es un detalle técnico aburrido.')).toBe(false)
    expect(isCapsHeading('ESTO ES UNA FRASE COMPLETA EN MAYÚSCULAS QUE TERMINA EN PUNTO.')).toBe(false)
    expect(isCapsHeading('2026')).toBe(false)
    expect(isCapsHeading('A'.repeat(120))).toBe(false)
  })
})

describe('promoteCapsHeadings', () => {
  it('turns those paragraphs into subtitles and leaves the rest alone', () => {
    const html = '<p>LA NOTICIA QUE ESTABAS ESPERANDO</p><p>Olvídate de todo lo que sabías.</p><p>¿CUÁL ES EL PLOT TWIST?</p>'
    expect(promoteCapsHeadings(html)).toBe('<h2>LA NOTICIA QUE ESTABAS ESPERANDO</h2><p>Olvídate de todo lo que sabías.</p><h2>¿CUÁL ES EL PLOT TWIST?</h2>')
  })

  it('does not touch a paragraph that has other tags inside', () => {
    const html = '<p><strong>NOTA</strong> IMPORTANTE</p><p><img src="x.png"></p>'
    expect(promoteCapsHeadings(html)).toBe(html)
  })
})

describe('excerptRepeatsBody', () => {
  const body = 'LA NOTICIA QUE ESTABAS ESPERANDO\n\nOlvídate de todo lo que sabías sobre inteligencia artificial.'

  it('is true when the body starts with the same text as the excerpt', () => {
    expect(excerptRepeatsBody('LA NOTICIA QUE ESTABAS ESPERANDO Olvídate de todo lo que sabías sobre inteligencia artificial: ...', body)).toBe(true)
  })

  it('is false when the excerpt says something else, or is missing', () => {
    expect(excerptRepeatsBody('Un resumen distinto del artículo completo que no aparece igual', body)).toBe(false)
    expect(excerptRepeatsBody(null, body)).toBe(false)
    expect(excerptRepeatsBody('Algo', null)).toBe(false)
  })

  it('ignores punctuation and markup when it compares', () => {
    expect(excerptRepeatsBody('La noticia que estabas esperando', '<p><strong>LA NOTICIA</strong> que estabas esperando</p>')).toBe(true)
  })
})
