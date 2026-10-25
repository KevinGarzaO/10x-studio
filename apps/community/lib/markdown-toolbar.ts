/**
 * Las acciones de la barra del editor (negritas, listas, enlaces…) sobre un texto en Markdown.
 * Funciones puras: reciben el texto y la selección, y devuelven el texto nuevo y dónde queda la selección.
 */
export type FormatAction = 'bold' | 'italic' | 'link' | 'ol' | 'ul' | 'heading' | 'quote' | 'code' | 'codeblock'

export interface Edit {
  value: string
  start: number
  end: number
}

function wrap(value: string, start: number, end: number, before: string, after: string, placeholder: string): Edit {
  const selected = value.slice(start, end) || placeholder
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  return { value: next, start: start + before.length, end: start + before.length + selected.length }
}

/** Aplica un prefijo a cada línea de la selección (o a la línea donde está el cursor). */
function prefixLines(value: string, start: number, end: number, prefix: (index: number) => string): Edit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const nextBreak = value.indexOf('\n', end)
  const lineEnd = nextBreak === -1 ? value.length : nextBreak
  const lines = value.slice(lineStart, lineEnd).split('\n')
  const changed = lines.map((line, index) => prefix(index) + line).join('\n')
  const next = value.slice(0, lineStart) + changed + value.slice(lineEnd)
  return { value: next, start: lineStart, end: lineStart + changed.length }
}

export function applyFormat(value: string, start: number, end: number, action: FormatAction): Edit {
  switch (action) {
    case 'bold':
      return wrap(value, start, end, '**', '**', 'texto en negritas')
    case 'italic':
      return wrap(value, start, end, '*', '*', 'texto en cursiva')
    case 'code':
      return wrap(value, start, end, '`', '`', 'código')
    case 'link': {
      const label = value.slice(start, end) || 'texto del enlace'
      const next = `${value.slice(0, start)}[${label}](https://)${value.slice(end)}`
      const urlStart = start + label.length + 3
      return { value: next, start: urlStart, end: urlStart + 'https://'.length }
    }
    case 'ul':
      return prefixLines(value, start, end, () => '- ')
    case 'ol':
      return prefixLines(value, start, end, index => `${index + 1}. `)
    case 'heading':
      return prefixLines(value, start, end, () => '## ')
    case 'quote':
      return prefixLines(value, start, end, () => '> ')
    case 'codeblock': {
      const selected = value.slice(start, end) || 'código'
      const lead = start > 0 && value[start - 1] !== '\n' ? '\n' : ''
      const next = `${value.slice(0, start)}${lead}\`\`\`\n${selected}\n\`\`\`\n${value.slice(end)}`
      const from = start + lead.length + 4
      return { value: next, start: from, end: from + selected.length }
    }
  }
}

/** Inserta un texto (por ejemplo una imagen) donde está el cursor, en su propia línea. */
export function insertAtCursor(value: string, start: number, end: number, text: string): Edit {
  const lead = start > 0 && value[start - 1] !== '\n' ? '\n\n' : ''
  const tail = end < value.length && value[end] !== '\n' ? '\n\n' : '\n'
  const next = value.slice(0, start) + lead + text + tail + value.slice(end)
  const cursor = start + lead.length + text.length + tail.length
  return { value: next, start: cursor, end: cursor }
}
