import { describe, it, expect } from 'vitest'
import { applyFormat, insertAtCursor } from '@/lib/markdown-toolbar'

describe('applyFormat', () => {
  it('wraps the selection in bold, italic and code', () => {
    expect(applyFormat('hola mundo', 5, 10, 'bold').value).toBe('hola **mundo**')
    expect(applyFormat('hola mundo', 5, 10, 'italic').value).toBe('hola *mundo*')
    expect(applyFormat('hola mundo', 5, 10, 'code').value).toBe('hola `mundo`')
  })

  it('leaves the wrapped text selected, so a second click can keep editing', () => {
    const edit = applyFormat('hola mundo', 5, 10, 'bold')
    expect(edit.value.slice(edit.start, edit.end)).toBe('mundo')
  })

  it('writes a placeholder when nothing is selected, and selects it', () => {
    const edit = applyFormat('', 0, 0, 'bold')
    expect(edit.value).toBe('**texto en negritas**')
    expect(edit.value.slice(edit.start, edit.end)).toBe('texto en negritas')
  })

  it('makes a link and selects the address to type', () => {
    const edit = applyFormat('mira esto', 5, 9, 'link')
    expect(edit.value).toBe('mira [esto](https://)')
    expect(edit.value.slice(edit.start, edit.end)).toBe('https://')
  })

  it('turns every selected line into a list item, numbered or not', () => {
    expect(applyFormat('uno\ndos\ntres', 0, 12, 'ul').value).toBe('- uno\n- dos\n- tres')
    expect(applyFormat('uno\ndos\ntres', 0, 12, 'ol').value).toBe('1. uno\n2. dos\n3. tres')
  })

  it('only changes the line where the cursor is when nothing is selected', () => {
    expect(applyFormat('uno\ndos\ntres', 5, 5, 'quote').value).toBe('uno\n> dos\ntres')
    expect(applyFormat('uno\ndos', 1, 1, 'heading').value).toBe('## uno\ndos')
  })

  it('makes a code block on its own lines', () => {
    const edit = applyFormat('antes', 5, 5, 'codeblock')
    expect(edit.value).toBe('antes\n```\ncódigo\n```\n')
    expect(edit.value.slice(edit.start, edit.end)).toBe('código')
  })
})

describe('insertAtCursor', () => {
  it('puts an image on its own paragraph', () => {
    const edit = insertAtCursor('uno dos', 3, 3, '![a](https://x.test/a.png)')
    expect(edit.value).toBe('uno\n\n![a](https://x.test/a.png)\n\n dos')
  })

  it('does not add empty lines at the very start', () => {
    expect(insertAtCursor('', 0, 0, '![a](https://x.test/a.png)').value).toBe('![a](https://x.test/a.png)\n')
  })
})
