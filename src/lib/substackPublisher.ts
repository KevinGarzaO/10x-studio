import { db } from './storage'

// Build Cookie header from all stored Substack cookies
export function buildCookieHeader(): string {
  const settings = db.settings.get() as any
  const cookies  = settings.substackCookies as Record<string, string> | undefined

  if (cookies && Object.keys(cookies).length > 0) {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  }
  // Fallback for legacy single cookie
  if (settings.substackCookie) return `substack.sid=${settings.substackCookie}`
  return ''
}

export function substackHeaders(cookieHeader: string) {
  return {
    'Content-Type': 'application/json',
    'Cookie': cookieHeader,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
    'Referer': 'https://substack.com/',
    'Origin': 'https://substack.com',
  }
}

function mdToProseMirror(md: string): object[] {
  const nodes: object[] = []
  for (const line of md.split('\n')) {
    const clean = line
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
    if (!line.trim()) {
      nodes.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] })
    } else if (line.startsWith('# ')) {
      nodes.push({ type: 'heading', attrs: { level: 1, id: null }, content: [{ type: 'text', text: line.replace(/^# /, '') }] })
    } else if (line.startsWith('## ')) {
      nodes.push({ type: 'heading', attrs: { level: 2, id: null }, content: [{ type: 'text', text: line.replace(/^## /, '') }] })
    } else if (line.startsWith('### ')) {
      nodes.push({ type: 'heading', attrs: { level: 3, id: null }, content: [{ type: 'text', text: line.replace(/^### /, '') }] })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push({ type: 'bullet_list', content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: clean.replace(/^[-*] /, '') }] }] }] })
    } else {
      nodes.push({ type: 'paragraph', content: [{ type: 'text', text: clean }] })
    }
  }
  return nodes
}

export async function publishNote(content: string): Promise<{ id: string; url: string | null }> {
  const cookie  = buildCookieHeader()
  const headers = substackHeaders(cookie)

  const res = await fetch('https://substack.com/api/v1/comment/feed', {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: content, type: 'feed' }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Substack ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = await res.json()
  return { id: String(data.id), url: data.url ?? null }
}

export async function publishArticle(
  title: string,
  content: string,
  subtitle = '',
  scheduleAt: string | null = null
): Promise<{ id: string; scheduled: boolean }> {
  const cookie  = buildCookieHeader()
  const headers = substackHeaders(cookie)

  // Get publication subdomain
  const settings = db.settings.get() as any
  let pubSlug = settings.substackSubdomain

  // Fallback to fetch only if we don't have it saved
  if (!pubSlug) {
    const meRes = await fetch('https://substack.com/api/v1/subscriber/me', { headers })
    if (!meRes.ok) throw new Error(`No se pudo obtener perfil: ${meRes.status}`)
    const me = await meRes.json()
    pubSlug = me?.primaryPublication?.subdomain
  }
  
  if (!pubSlug) throw new Error('No se encontró tu publicación de Substack')

  const pubHeaders = { ...headers, 'Referer': `https://${pubSlug}.substack.com/` }

  // Create draft
  const draftRes = await fetch(`https://${pubSlug}.substack.com/api/v1/drafts`, {
    method: 'POST',
    headers: pubHeaders,
    body: JSON.stringify({
      type: 'newsletter',
      draft_title: title.trim(),
      draft_subtitle: subtitle.trim(),
      draft_body: JSON.stringify({
        type: 'doc',
        attrs: { schemaVersion: 'v1' },
        content: mdToProseMirror(content),
      }),
      audience: 'everyone',
      section_chosen: false,
      draft_section_id: null,
    }),
  })
  if (!draftRes.ok) {
    const txt = await draftRes.text()
    throw new Error(`Error creando draft ${draftRes.status}: ${txt.slice(0, 200)}`)
  }
  const draft = await draftRes.json()

  // Publish or schedule
  const pubRes = await fetch(`https://${pubSlug}.substack.com/api/v1/drafts/${draft.id}/publish`, {
    method: 'POST',
    headers: pubHeaders,
    body: JSON.stringify({ send_email: true, audience: 'everyone', send_at: scheduleAt }),
  })
  if (!pubRes.ok) {
    const txt = await pubRes.text()
    throw new Error(`Error publicando ${pubRes.status}: ${txt.slice(0, 200)}`)
  }

  return { id: String(draft.id), scheduled: !!scheduleAt }
}
