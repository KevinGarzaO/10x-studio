import { Router, Request, Response } from 'express'
import { parseEvent, recordEvent, verifySignature } from '../../../services/email/resend-webhook'

/**
 * POST /api/webhooks/resend: los avisos de Resend sobre los correos (entregado, rebote, queja, clic, apertura).
 * Se monta ANTES de `express.json` con `express.raw`, porque la firma se calcula sobre el cuerpo tal como llegó.
 * Sin RESEND_WEBHOOK_SECRET responde 503 y no guarda nada; con firma mala, 400.
 */
const router = Router()

router.post('/', async (req: Request, res: Response) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return res.status(503).json({ error: 'El webhook de Resend no está activado' })

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : ''
  const valid = verifySignature(raw, { id: req.header('svix-id'), timestamp: req.header('svix-timestamp'), signature: req.header('svix-signature') }, secret)
  if (!valid) return res.status(400).json({ error: 'Firma inválida' })

  let body: unknown
  try { body = JSON.parse(raw) } catch { return res.status(400).json({ error: 'Cuerpo inválido' }) }

  const event = parseEvent(body, String(req.header('svix-id')))
  if (!event) return res.json({ status: 'ignored' }) // un tipo que no usamos: no es un error, así Resend no reintenta
  try {
    res.json(await recordEvent(event))
  } catch (error) {
    // Sin la tabla (migración pendiente) o con la base caída: Resend reintenta más tarde.
    console.error('[ResendWebhook] No se pudo guardar el aviso:', error instanceof Error ? error.message : error)
    res.status(500).json({ error: 'No se pudo guardar' })
  }
})

export default router
