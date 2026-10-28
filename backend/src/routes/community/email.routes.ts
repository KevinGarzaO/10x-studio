import { Router, Request, Response } from 'express'
import { supabase } from '../../../services/supabase.service'
import { verifyUnsubscribeToken } from '../../../services/email/links'

const router = Router()

const page = (title: string, message: string) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:480px;margin:12vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center">
<p style="margin:0 0 12px;font-size:20px;font-weight:800"><span>Avo</span><span style="color:#00a86b">Talent</span></p>
<h1 style="margin:0 0 10px;font-size:18px">${title}</h1><p style="margin:0;font-size:15px;color:#4b5563;line-height:1.6">${message}</p></div></body></html>`

/**
 * Baja de los correos de AvoTalent. El enlace viene en cada correo, firmado con la persona (ver links.ts): sin la
 * firma correcta no hace nada. Acepta GET (el clic) y POST (la baja en un toque que ofrecen Gmail y Apple Mail).
 * Es pública a propósito: la persona no tiene que iniciar sesión para dejar de recibir correos.
 */
async function unsubscribe(req: Request, res: Response) {
  const secret = process.env.EMAIL_LINK_SECRET
  const userId = String(req.query.u ?? '')
  const token = String(req.query.t ?? '')

  if (!secret) return res.status(503).type('html').send(page('No disponible', 'Esta función no está disponible por ahora.'))
  if (!verifyUnsubscribeToken(userId, token, secret)) {
    return res.status(400).type('html').send(page('Enlace no válido', 'Este enlace no es válido o está incompleto.'))
  }

  const { error } = await supabase.from('users').update({ email_opt_out: true }).eq('id', userId)
  if (error) return res.status(500).type('html').send(page('No se pudo completar', 'Intenta de nuevo en unos minutos.'))
  return res.type('html').send(page('Listo, no recibirás más correos', 'Dimos de baja tu correo de los mensajes de AvoTalent. Si fue un error, puedes seguir usando la app normalmente.'))
}

router.get('/unsubscribe', unsubscribe)
router.post('/unsubscribe', unsubscribe)

export default router
