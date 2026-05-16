
export interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, any>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
}

export function mdToAST(md: string): ProseMirrorNode {
  // --- NEW: Limpieza profunda de HTML residual ---
  // Si la IA mandó <p> o <div>, los normalizamos para que el conversor trabaje con texto limpio.
  let cleanMD = md
    .replace(/<p>/g, '')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<div>/g, '')
    .replace(/<\/div>/g, '\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    // Eliminamos cualquier otra etiqueta HTML, excepto las imágenes que procesamos luego
    .replace(/<(?!img|data-type="subscribe-widget")[^>]*>?/gm, '');

  // Append WhatsApp signature if not present
  if (!cleanMD.includes('chat.whatsapp.com')) {
    cleanMD += `\n\n**¿Ya eres parte de nuestra comunidad de WhatsApp?**\n\nMira, somos más de 600 personas construyendo la comunidad de IA más grande en español y Latinoamérica. Tenemos un grupo activo en WhatsApp donde compartimos noticias como esta en tiempo real, discutimos las implicaciones para nuestros negocios y nos ayudamos entre todos.\n\nVamos por 1,000 miembros. Si esto que leíste te resonó, deberías estar ahí.\n\n[Únete al grupo de WhatsApp](https://chat.whatsapp.com/CQsp63vm1oW3QNS3Q87gZA)\n\nNos vemos del otro lado.\n\nKevin Garza  \nFundador, Transformateck`;
  }

  const blocks = cleanMD.split('\n\n').filter(b => b.trim());
  const content: ProseMirrorNode[] = [];
  
  const total = blocks.length;
  const firstThird = Math.max(1, Math.floor(total * 0.25));
  const middle = Math.max(2, Math.floor(total * 0.55));
  const end = total - 1;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const trimmed = block.trim();

    // 1. Headings
    if (trimmed.startsWith('# ')) {
      content.push({
        type: 'heading',
        attrs: { level: 1, textAlign: null },
        content: parseInline(trimmed.replace(/^#\s/, ''))
      });
    }
    else if (trimmed.startsWith('## ')) {
      content.push({
        type: 'heading',
        attrs: { level: 2, textAlign: null },
        content: parseInline(trimmed.replace(/^##\s/, ''))
      });
    }
    else if (trimmed.startsWith('### ')) {
      content.push({
        type: 'heading',
        attrs: { level: 3, textAlign: null },
        content: parseInline(trimmed.replace(/^###\s/, ''))
      });
    }
    // 2. Lists
    else if (trimmed.startsWith('- ')) {
      const items = trimmed.split('\n').filter(l => l.trim().startsWith('- '));
      content.push({
        type: 'bulletList',
        content: items.map(item => ({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            attrs: { textAlign: null },
            content: parseInline(item.replace(/^- /, ''))
          }]
        }))
      });
    }
    // 3. Images (Special case for the ones we inject)
    else if (trimmed.includes('<img')) {
      const imgMatch = trimmed.match(/src="([^"]+)"/i);
      const altMatch = trimmed.match(/alt="([^"]*)"/i);
      if (imgMatch) {
        content.push({
          type: 'captionedImage',
          content: [{
            type: 'image2',
            attrs: {
              src: imgMatch[1],
              alt: altMatch ? altMatch[1] : null,
              fullscreen: null,
              imageSize: null,
              resizeWidth: null,
              belowTheFold: false,
              topImage: false,
              isProcessing: false,
              align: null,
              offset: false
            }
          }]
        });
      }
    }
    // 4. Widgets
    else if (trimmed.includes('data-type="subscribe-widget"')) {
      content.push(getSubscribeWidget());
    }
    // 5. Paragraphs (Default)
    else {
      content.push({
        type: 'paragraph',
        attrs: { textAlign: null },
        content: parseInline(trimmed)
      });
    }

    // Inject Subscribe Widgets at specific intervals
    if (i === firstThird || i === middle) {
      content.push(getSubscribeWidget());
    }
  }

  return { type: 'doc', content };
}

function getSubscribeWidget(): ProseMirrorNode {
  return {
    type: 'subscribeWidget',
    attrs: {
      url: "%%checkout_url%%",
      text: "Suscribirse",
      language: "es"
    },
    content: [{
      type: 'ctaCaption',
      content: [{
        type: 'text',
        text: "¡Gracias por leer Transformateck! Suscríbete gratis para recibir nuevas publicaciones y apoyar mi trabajo."
      }]
    }]
  };
}

function parseInline(text: string): ProseMirrorNode[] {
  let nodes: ProseMirrorNode[] = [{ type: 'text', text }];

  // 1. Links: [text](url)
  nodes = nodes.flatMap(node => {
    if (!node.text || node.marks) return [node];
    const segments: ProseMirrorNode[] = [];
    let lastIndex = 0;
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(node.text)) !== null) {
      if (match.index > lastIndex) segments.push({ type: 'text', text: node.text.substring(lastIndex, match.index) });
      segments.push({
        type: 'text',
        text: match[1],
        marks: [{ type: 'link', attrs: { href: match[2] } }]
      });
      lastIndex = linkRegex.lastIndex;
    }
    if (lastIndex < node.text.length) segments.push({ type: 'text', text: node.text.substring(lastIndex) });
    return segments;
  });

  // 2. Bold: **text**
  nodes = nodes.flatMap(node => {
    if (!node.text || (node.marks && node.marks.some(m => m.type === 'bold'))) return [node];
    const segments: ProseMirrorNode[] = [];
    let lastIndex = 0;
    const boldRegex = /\*\*([^*]+)\*\*/g;
    let match;
    while ((match = boldRegex.exec(node.text)) !== null) {
      if (match.index > lastIndex) segments.push({ type: 'text', text: node.text.substring(lastIndex, match.index), marks: node.marks });
      segments.push({
        type: 'text',
        text: match[1],
        marks: [...(node.marks || []), { type: 'bold' }]
      });
      lastIndex = boldRegex.lastIndex;
    }
    if (lastIndex < node.text.length) segments.push({ type: 'text', text: node.text.substring(lastIndex), marks: node.marks });
    return segments;
  });

  // 3. Italic: *text*
  nodes = nodes.flatMap(node => {
    if (!node.text || (node.marks && node.marks.some(m => m.type === 'italic'))) return [node];
    const segments: ProseMirrorNode[] = [];
    let lastIndex = 0;
    const italicRegex = /(?<!\*)\*([^*]+)\*(?!\*)/g;
    let match;
    while ((match = italicRegex.exec(node.text)) !== null) {
      if (match.index > lastIndex) segments.push({ type: 'text', text: node.text.substring(lastIndex, match.index), marks: node.marks });
      segments.push({
        type: 'text',
        text: match[1],
        marks: [...(node.marks || []), { type: 'italic' }]
      });
      lastIndex = italicRegex.lastIndex;
    }
    if (lastIndex < node.text.length) segments.push({ type: 'text', text: node.text.substring(lastIndex), marks: node.marks });
    return segments;
  });

  return nodes;
}
