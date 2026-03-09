import { db } from './storage'

const BYLINE_ID = 280221962

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

export function substackHeaders(cookieHeader: string, pubSlug?: string) {
  const base = pubSlug
    ? `https://${pubSlug}.substack.com`
    : 'https://substack.com'
  return {
    'Content-Type':   'application/json',
    'Cookie':         cookieHeader,
    'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept':         'application/json',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
    'Origin':         base,
    'Referer':        `${base}/`,
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
      nodes.push({ type: 'paragraph', attrs: { textAlign: null } })
    } else if (line.startsWith('# ')) {
      nodes.push({ type: 'heading', attrs: { level: 1, id: null }, content: [{ type: 'text', text: line.replace(/^# /, '') }] })
    } else if (line.startsWith('## ')) {
      nodes.push({ type: 'heading', attrs: { level: 2, id: null }, content: [{ type: 'text', text: line.replace(/^## /, '') }] })
    } else if (line.startsWith('### ')) {
      nodes.push({ type: 'heading', attrs: { level: 3, id: null }, content: [{ type: 'text', text: line.replace(/^### /, '') }] })
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push({
        type: 'bullet_list',
        content: [{
          type: 'list_item',
          content: [{
            type: 'paragraph',
            attrs: { textAlign: null },
            content: [{ type: 'text', text: clean.replace(/^[-*] /, '') }],
          }],
        }],
      })
    } else {
      nodes.push({ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: clean }] })
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
  const cookie = buildCookieHeader()

  // Get publication subdomain
  const settings = db.settings.get() as any
  let pubSlug: string = settings.substackSubdomain

  // Fallback: fetch from profile
  if (!pubSlug) {
    const meRes = await fetch('https://substack.com/api/v1/subscriber/me', {
      headers: substackHeaders(cookie),
    })
    if (!meRes.ok) throw new Error(`No se pudo obtener perfil: ${meRes.status}`)
    const me = await meRes.json()
    pubSlug = me?.primaryPublication?.subdomain
  }

  if (!pubSlug) throw new Error('No se encontró tu publicación de Substack')

  const headers = substackHeaders(cookie, pubSlug)

  // ── Step 1: Create empty draft ─────────────────────────────────────────
  const emptyBody = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { textAlign: null } }],
  })

  const createRes = await fetch(`https://${pubSlug}.substack.com/api/v1/drafts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      draft_title:            '',
      draft_subtitle:         '',
      draft_podcast_url:      null,
      draft_podcast_duration: null,
      draft_body:             emptyBody,
      section_chosen:         false,
      draft_section_id:       null,
      draft_bylines:          [{ id: BYLINE_ID, is_guest: false }],
      audience:               'everyone',
      type:                   'newsletter',
    }),
  })
  if (!createRes.ok) {
    const txt = await createRes.text()
    throw new Error(`Error creando draft ${createRes.status}: ${txt.slice(0, 300)}`)
  }
  const draft = await createRes.json()
  const draftId: number = draft.id

  // ── Step 2: Update draft with real content ─────────────────────────────
  const updateRes = await fetch(`https://${pubSlug}.substack.com/api/v1/drafts/${draftId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      draft_title:            title.trim(),
      draft_subtitle:         subtitle.trim(),
      draft_podcast_url:      null,
      draft_podcast_duration: null,
      draft_body:             JSON.stringify({ type: 'doc', content: mdToProseMirror(content) }),
      section_chosen:         false,
      draft_section_id:       null,
      draft_bylines:          [{ id: BYLINE_ID, is_guest: false }],
      last_updated_at:        draft.draft_updated_at,
    }),
  })
  if (!updateRes.ok) {
    const txt = await updateRes.text()
    throw new Error(`Error actualizando draft ${updateRes.status}: ${txt.slice(0, 300)}`)
  }

  // ── Step 3: Schedule / publish immediately ─────────────────────────────
  // For "now", trigger_at = current time + 10 seconds
  const triggerAt = scheduleAt
    ? new Date(scheduleAt).toISOString()
    : new Date(Date.now() + 10_000).toISOString()

  const schedRes = await fetch(
    `https://${pubSlug}.substack.com/api/v1/drafts/${draftId}/scheduled_release`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        trigger_at:    triggerAt,
        post_audience: 'everyone',
      }),
    }
  )
  if (!schedRes.ok) {
    const txt = await schedRes.text()
    throw new Error(`Error programando ${schedRes.status}: ${txt.slice(0, 300)}`)
  }

  return { id: String(draftId), scheduled: !!scheduleAt }
}
