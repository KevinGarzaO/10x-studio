import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage'

export async function POST(req: NextRequest) {
  const { content, title, type } = await req.json()
  // type: 'post' (short) | 'article' (long-form)

  const cfg = db.integrations.get()
  if (!cfg.linkedinToken)
    return NextResponse.json({ error: 'LinkedIn no configurado. Ve a Integraciones → LinkedIn.' }, { status: 401 })
  if (!content?.trim()) return NextResponse.json({ error: 'El contenido es requerido' }, { status: 400 })

  const headers = {
    'Authorization': `Bearer ${cfg.linkedinToken}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': '202401',
  }

  try {
    // First get the person URN if we don't have it
    let personId = cfg.linkedinPersonId
    if (!personId) {
      const meRes = await fetch('https://api.linkedin.com/v2/userinfo', { headers })
      if (!meRes.ok) throw new Error(`LinkedIn auth error ${meRes.status} — verifica tu access token`)
      const me = await meRes.json()
      personId  = me.sub   // OpenID Connect sub = person URN suffix
      // Save it for next time
      db.integrations.save({ ...cfg, linkedinPersonId: personId })
    }

    const authorUrn = `urn:li:person:${personId}`

    if (type === 'article') {
      // LinkedIn Articles via UGC Posts with article share
      const body = {
        author:         authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary:  { text: content.slice(0, 3000) },
            shareMediaCategory: 'ARTICLE',
            media: [{
              status: 'READY',
              description: { text: title || '' },
              title:       { text: title || '' },
            }],
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST', headers, body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `LinkedIn error ${res.status}`)
      }
      const data = await res.json()
      return NextResponse.json({ ok: true, id: data.id })

    } else {
      // LinkedIn Post (text only) via Posts API
      const body = {
        author:         authorUrn,
        commentary:     content.slice(0, 3000),
        visibility:     'PUBLIC',
        distribution: {
          feedDistribution:           'MAIN_FEED',
          targetEntities:             [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState:    'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }
      const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST', headers, body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `LinkedIn error ${res.status}`)
      }
      // LinkedIn returns 201 with post URN in header
      const postUrn = res.headers.get('x-restli-id') || res.headers.get('location') || ''
      return NextResponse.json({ ok: true, id: postUrn })
    }

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
