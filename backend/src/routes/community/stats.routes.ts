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

export default router
