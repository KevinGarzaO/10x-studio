import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'

const router = Router()

// Real counts for the "La comunidad" sidebar widget — replaces the
// hardcoded 18.4k/2.1k/94%/342-online placeholders. There's no presence
// tracking, so "online now" and "% respond" have no real number behind them
// and are intentionally not part of this response.
router.get('/', async (req: Request, res: Response) => {
  try {
    const [{ count: members, error: membersError }, { count: posts, error: postsError }] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('community_posts').select('*', { count: 'exact', head: true }),
    ])

    if (membersError) throw membersError
    if (postsError) throw postsError

    res.json({ members: members || 0, posts: posts || 0 })
  } catch (error) {
    console.error('Community Get stats error:', error)
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
})

// Most-used tags across community posts, for the "Tus temas" sidebar
// section — replaces the fixed javascript/react/nextjs/... list.
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '6', 10)

    const { data, error } = await supabase
      .from('community_post_tags')
      .select('tag:community_tags(name)')

    if (error) throw error

    const counts = new Map<string, number>()
    for (const row of data || []) {
      const name = (row as any).tag?.name
      if (!name) continue
      counts.set(name, (counts.get(name) || 0) + 1)
    }

    const tags = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }))

    res.json({ tags })
  } catch (error) {
    console.error('Community Get trending tags error:', error)
    res.status(500).json({ error: 'Error al obtener los temas' })
  }
})

const SCRAPER_BOT_ID = '00000000-0000-0000-0000-000000000001'

// Companies with at least one active job post right now, for the hero
// banner's trust strip — real logos of companies actually hiring today,
// not a fixed hand-picked list, so it never shows a stale/false claim.
router.get('/companies', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '6', 10)

    const { data, error } = await supabase
      .from('community_posts')
      .select('author:users(id, username, display_name, name, photo_url)')
      .eq('type', 'job')

    if (error) throw error

    const counts = new Map<string, { username: string; name: string; logo_url: string | null; count: number }>()
    for (const row of data || []) {
      const author = (row as any).author
      if (!author || !author.id || author.id === SCRAPER_BOT_ID) continue
      const existing = counts.get(author.username)
      if (existing) {
        existing.count++
      } else {
        counts.set(author.username, {
          username: author.username,
          name: author.display_name || author.name || author.username,
          logo_url: author.photo_url,
          count: 1,
        })
      }
    }

    const companies = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(({ username, name, logo_url }) => ({ username, name, logo_url }))

    res.json({ companies })
  } catch (error) {
    console.error('Community Get hiring companies error:', error)
    res.status(500).json({ error: 'Error al obtener las empresas' })
  }
})

export default router
