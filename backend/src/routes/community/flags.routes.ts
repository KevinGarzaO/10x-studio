import { Router, Request, Response } from 'express'
import { getOptionalUserId } from '../../../services/community/viewer'
import { flagsFor } from '../../../services/flags/flags.service'

/**
 * Qué funciones ve esta persona. Sesión opcional: sin sesión solo llegan las que están en «Todos». Contesta SOLO las encendidas
 * (`{ flags: { nombre: true } }`): no revela cuántas funciones hay en pruebas ni en qué paso van. La respuesta cambia por persona, así que
 * nunca se guarda en cachés compartidas. Nunca falla: ante cualquier problema contesta que no hay funciones nuevas.
 */
const router = Router()

router.get('/', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Vary', 'Authorization')
  try {
    const userId = await getOptionalUserId(req).catch(() => null)
    res.json({ flags: await flagsFor(userId) })
  } catch {
    res.json({ flags: {} })
  }
})

export default router
