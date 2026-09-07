import { Router, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { communityAuthMiddleware, AuthRequest } from '../../../middleware/community-auth.middleware'

const router = Router()

interface MatchedItem {
  sourceType: 'scraper' | 'community'
  id: string
  title: string
  company: string | null
  companyLogo: string | null
  roleCategory: string | null
  seniorityLevel: string | null
  skills: string[]
  url: string
  postDate: string | null
  matchingSkills: number
}

function toSkillArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string')
  return []
}

// "Para ti" — matches a candidate's role_category + seniority_level against
// both the scraper staging buffer (not yet promoted) and the published
// community_posts, unlike the daily Sync cron this has no per-combo cap —
// it's the user's own full pool, not a shared daily quota.
router.get('/for-you', communityAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role_category, seniority, skills')
      .eq('id', req.userId)
      .single()

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (!user.role_category || !user.seniority) {
      return res.status(400).json({ error: 'Completa tu perfil (rol y nivel) para ver tu feed personalizado' })
    }

    const userSkills = new Set((user.skills || []).map((s: string) => s.toLowerCase()))

    const [{ data: scraperRows }, { data: communityRows }] = await Promise.all([
      supabase
        .from('scraper_posts')
        .select('id, text, company, company_logo, role_category, seniority_level, skills, url, post_date, created_at')
        .eq('post_type', 'vacancy')
        .eq('is_spam', false)
        .eq('role_category', user.role_category)
        .eq('seniority_level', user.seniority)
        .limit(200),
      supabase
        .from('community_posts')
        .select('id, title, company, company_logo, role_category, seniority_level, skills, slug, created_at')
        .eq('type', 'job')
        .eq('role_category', user.role_category)
        .eq('seniority_level', user.seniority)
        .limit(200),
    ])

    const items: MatchedItem[] = []

    for (const row of scraperRows || []) {
      const skills = toSkillArray(row.skills)
      items.push({
        sourceType: 'scraper',
        id: row.id,
        title: row.text?.split('\n')[0]?.replace(/^##\s*/, '').substring(0, 150) || 'Vacante sin título',
        company: row.company,
        companyLogo: row.company_logo,
        roleCategory: row.role_category,
        seniorityLevel: row.seniority_level,
        skills,
        url: row.url || '',
        postDate: row.post_date || row.created_at,
        matchingSkills: skills.filter(s => userSkills.has(s.toLowerCase())).length,
      })
    }

    for (const row of communityRows || []) {
      const skills = toSkillArray(row.skills)
      items.push({
        sourceType: 'community',
        id: row.id,
        title: row.title,
        company: row.company,
        companyLogo: row.company_logo,
        roleCategory: row.role_category,
        seniorityLevel: row.seniority_level,
        skills,
        url: `/vacantes/${row.slug || row.id}`,
        postDate: row.created_at,
        matchingSkills: skills.filter(s => userSkills.has(s.toLowerCase())).length,
      })
    }

    items.sort((a, b) => {
      if (b.matchingSkills !== a.matchingSkills) return b.matchingSkills - a.matchingSkills
      return new Date(b.postDate ?? 0).getTime() - new Date(a.postDate ?? 0).getTime()
    })

    const page = items.slice(0, 50)

    // Snapshot side effect — every vacancy shown gets (or refreshes) a
    // history row, so it survives even if scraper_posts later sweeps it.
    // Selecting the upsert back gives each item its history row id/is_saved
    // state, so the frontend can offer a real "quitar guardado" toggle
    // without a second round-trip.
    let itemsWithHistory: (MatchedItem & { historyId: string; isSaved: boolean })[] = page.map(item => ({ ...item, historyId: '', isSaved: false }))
    if (page.length > 0) {
      const writes = page.map(item => ({
        user_id: req.userId,
        source_type: item.sourceType,
        source_id: item.id,
        title: item.title,
        company: item.company,
        company_logo: item.companyLogo,
        role_category: item.roleCategory,
        seniority_level: item.seniorityLevel,
        skills: item.skills,
        url: item.url,
        seen_at: new Date().toISOString(),
      }))
      const { data: historyRows } = await supabase
        .from('user_vacancy_history')
        .upsert(writes, { onConflict: 'user_id,source_type,source_id' })
        .select('id, source_type, source_id, is_saved')

      const historyByKey = new Map((historyRows || []).map((r: any) => [`${r.source_type}:${r.source_id}`, r]))
      itemsWithHistory = page.map(item => {
        const row = historyByKey.get(`${item.sourceType}:${item.id}`)
        return { ...item, historyId: row?.id ?? '', isSaved: !!row?.is_saved }
      })
    }

    res.json({ items: itemsWithHistory, total: items.length })
  } catch (error) {
    console.error('Community for-you feed error:', error)
    res.status(500).json({ error: 'Error al obtener tu feed personalizado' })
  }
})

export default router
