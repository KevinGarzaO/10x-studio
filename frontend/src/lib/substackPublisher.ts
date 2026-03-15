import { db } from './storage'

// Build Cookie header from relational tables
export async function buildCookieHeader(): Promise<string> {
  const user = await db.substack.user.get()
  if (!user) return ''

  const cookies = await db.substack.cookies.get(user.id)
  if (!cookies) return ''

  const parts = []
  if (cookies.substack_sid) parts.push(`substack.sid=${cookies.substack_sid}`)
  // Keep others as fallbacks if present, but sid is the main one
  if (cookies.substack_lli) parts.push(`substack.lli=${cookies.substack_lli}`)
  if (cookies.visit_id)    parts.push(`visit_id=${cookies.visit_id}`)
  
  return parts.join('; ')
}

export function substackHeaders(cookieHeader: string, pubSlug?: string) {
  const base = pubSlug
    ? `https://${pubSlug}.substack.com`
    : 'https://transformateck.substack.com'
  return {
    'Content-Type':   'application/json',
    'Cookie':         cookieHeader,
    'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
  const cookie  = await buildCookieHeader()
  const user    = await db.substack.user.get()
  const pubSlug = user?.subdomain || 'transformateck'
  const headers = substackHeaders(cookie, pubSlug)

  const bodyJson = {
    type: "doc",
    attrs: { schemaVersion: "v1" },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: content }]
      }
    ]
  }

  const res = await fetch(`https://${pubSlug}.substack.com/api/v1/comment/feed`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ 
      bodyJson,
      replyMinimumRole: "everyone"
    }),
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
  const cookie = await buildCookieHeader()
  const user = await db.substack.user.get()
  if (!user) throw new Error('No hay usuario de Substack conectado')
    
  const pubSlug = user.subdomain
  const bylineId = Number(user.substack_user_id || 0)
  if (!pubSlug) throw new Error('No se encontró tu publicación de Substack')

  const headers = substackHeaders(cookie, pubSlug)

  // 1. Create empty draft
  const createRes = await fetch(`https://${pubSlug}.substack.com/api/v1/drafts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      draft_title:            '',
      draft_subtitle:         '',
      draft_podcast_url:      null,
      draft_podcast_duration: null,
      draft_body:             JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] }),
      section_chosen:         false,
      draft_section_id:       null,
      draft_bylines:          [{ id: bylineId, is_guest: false }],
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

  // 2. Update draft with real content
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
      draft_bylines:          [{ id: bylineId, is_guest: false }],
      last_updated_at:        draft.draft_updated_at,
    }),
  })
  if (!updateRes.ok) {
    const txt = await updateRes.text()
    throw new Error(`Error actualizando draft ${updateRes.status}: ${txt.slice(0, 300)}`)
  }

  // 3. Schedule / publish
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
