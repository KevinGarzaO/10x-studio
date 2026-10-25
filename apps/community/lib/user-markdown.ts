import { Marked } from 'marked'

/**
 * Markdown de lo que escriben los miembros, convertido a HTML SEGURO.
 *
 * Es texto de personas, no del equipo: no se puede confiar en él. Por eso:
 *  - el HTML que escriban no se interpreta, se muestra como texto (nada de <script>, <img onerror>, <iframe>...);
 *  - un enlace solo puede ser http, https o mailto (`javascript:` se descarta) y se abre en otra pestaña con
 *    `rel="noopener noreferrer nofollow ugc"`;
 *  - una imagen solo puede venir de https.
 *
 * Es una instancia aparte de `marked`: los artículos del equipo siguen usando la suya, con su HTML.
 */
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const SAFE_LINK = /^(https?:|mailto:)/i
const SAFE_IMAGE = /^https:\/\//i

const safe = new Marked({ gfm: true, breaks: true })
safe.use({
  renderer: {
    html({ text }) {
      return escapeHtml(text)
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens)
      if (!SAFE_LINK.test(href.trim())) return label
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapeHtml(href.trim())}"${titleAttr} target="_blank" rel="noopener noreferrer nofollow ugc">${label}</a>`
    },
    image({ href, text }) {
      if (!SAFE_IMAGE.test(href.trim())) return escapeHtml(text)
      return `<img src="${escapeHtml(href.trim())}" alt="${escapeHtml(text)}" loading="lazy">`
    },
  },
})

export function renderUserMarkdown(markdown: string): string {
  return safe.parse(markdown ?? '', { async: false }) as string
}

/** Un resumen en texto plano, sin marcas de markdown, para las tarjetas. */
export function excerptOf(markdown: string | null | undefined, max = 200): string {
  const plain = (markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^[#>\-*+\d.\s]+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain
}
