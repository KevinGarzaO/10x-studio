import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'

const router = Router()

/**
 * GET /api/community/skills — el catálogo de skills aprobados y sus alias.
 *
 * AUTH: **público a propósito**. No contiene datos personales, y lo necesitan
 * pantallas sin sesión completa (el registro y el onboarding) además del
 * formulario de captura de preguntas. Es solo lectura y no acepta parámetros.
 *
 * `skills` contiene únicamente skills aprobados: las propuestas pendientes,
 * rechazadas y unidas viven en `skill_proposals` y nunca salen por aquí
 * (FR-010, FR-016).
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [skillsResult, aliasesResult] = await Promise.all([
      supabase.from('skills').select('name, label').order('label'),
      supabase.from('skill_aliases').select('alias_key, skill_name'),
    ])

    // Un fallo de lectura NO se devuelve como catálogo vacío: el frontend
    // trataría "sin skills" como un catálogo legítimo y dejaría guardar un
    // perfil sin skills o mostraría un examen como no disponible.
    if (skillsResult.error) throw skillsResult.error
    if (aliasesResult.error) throw aliasesResult.error

    // Un catálogo genuinamente vacío es casi seguro una migración sin aplicar en
    // este entorno. La respuesta sigue siendo 200 (la lectura sí funcionó), pero
    // se deja rastro para no depender de que alguien reporte la pantalla.
    if ((skillsResult.data || []).length === 0) {
      console.warn('[Skills] El catálogo de skills aprobados está VACÍO: falta sembrar la tabla skills')
    }

    res.json({
      skills: (skillsResult.data || []).map((row) => ({ name: row.name, label: row.label })),
      aliases: (aliasesResult.data || []).map((row) => ({
        alias: row.alias_key,
        skillName: row.skill_name,
      })),
    })
  } catch (error) {
    console.error('Community Get skills error:', error)
    res.status(500).json({ error: 'catalog_unavailable' })
  }
})

export default router
