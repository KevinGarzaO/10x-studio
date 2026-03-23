const fs = require('fs')

function mdToProseMirror(md) {
  const blocks = md.split('\n\n').filter(b => b.trim())
  const total = blocks.length
  const firstThird = Math.max(1, Math.floor(total * 0.25))
  const middle = Math.max(2, Math.floor(total * 0.55))
  const end = total - 1
  
  let html = ''
  let inList = false

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.startsWith('- ')) {
      if (!inList) {
        html += '<ul>\n'
        inList = true
      }
      const items = block.split('\n').filter(line => line.trim().startsWith('- '))
      for (const item of items) {
        let itemHtml = item.replace(/^- /, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        html += `<li><p>${itemHtml}</p></li>\n`
      }
      continue
    }

    if (inList) {
      html += '</ul>\n'
      inList = false
    }

    let parsedBlock = block.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

    if (parsedBlock.startsWith('# ')) {
      html += `<h1>${parsedBlock.replace(/^#\s/, '')}</h1>\n`
    } else if (parsedBlock.startsWith('## ')) {
      html += `<h2>${parsedBlock.replace(/^##\s/, '')}</h2>\n`
    } else if (parsedBlock.startsWith('### ')) {
      html += `<h3>${parsedBlock.replace(/^###\s/, '')}</h3>\n`
    } else {
      html += `<p>${parsedBlock}</p>\n`
    }
    
    // Inject Subscribe Widgets exactly after parsing the targeted blocks
    if (i === firstThird || i === middle || i === end) {
      if (inList) {
        html += '</ul>\n'
        inList = false
      }
      html += '<div data-type="subscribe-widget"></div>\n'
    }
  }

  if (inList) {
    html += '</ul>\n'
  }

  return html
}

const mdText = `
Paragraph 1.

Paragraph 2.

Paragraph 3.

Paragraph 4.

Paragraph 5.

Paragraph 6.

Paragraph 7.

Paragraph 8.

Paragraph 9.

Paragraph 10.
`;

console.log(mdToProseMirror(mdText))
