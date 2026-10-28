export const PROFILE_REMINDER_SUBJECT = 'Estás a un paso de ver las vacantes que hacen match contigo en AvoTalent'

export interface ReminderVacancy {
  title: string
  url: string
  /** Empresa • modalidad • nivel, ya armado. */
  meta: string
  /** 'popular' si es la más vista/guardada; 'reciente' si todavía no hay datos de popularidad. */
  label: 'popular' | 'reciente'
}

export interface ProfileReminderData {
  name: string
  completeProfileUrl: string
  vacancy: ReminderVacancy
  /** Cuántas vacantes abiertas hay hoy en el sitio. */
  openVacancies: number
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const LABELS = { popular: 'La vacante más popular', reciente: 'Vacante reciente' }

/**
 * Correo para quien creó su cuenta y no terminó su perfil. Explica qué son los skills, cómo se calcula la
 * compatibilidad y por qué conviene llenarlo. Todo lo que viene de datos se escapa; las cifras son reales.
 */
export function renderProfileReminder(data: ProfileReminderData): RenderedEmail {
  const { name, completeProfileUrl, vacancy, openVacancies } = data
  const others = Math.max(0, openVacancies - 1)
  const othersText = others > 0 ? `esta y las otras ${others.toLocaleString('es-MX')} vacantes abiertas` : 'esta vacante'

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="es">
  <head>
    <meta content="width=device-width, initial-scale=1.0" name="viewport" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta name="color-scheme" content="only light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${PROFILE_REMINDER_SUBJECT}</title>
  </head>
  <body dir="ltr" lang="es" style="margin: 0; padding: 0; background-color: #f3f4f6 !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <div style="display:none; overflow:hidden; line-height:1px; opacity:0; max-height:0; max-width:0;" data-skip-in-text="true">
      Dinos qué skills tienes y AvoTalent te muestra primero las vacantes que más encajan contigo. Toma un par de minutos.
    </div>

    <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center" style="background-color: #f3f4f6; padding: 30px 10px;">
      <tbody>
        <tr>
          <td align="center">
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff" style="max-width: 580px; background-color: #ffffff !important; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
              <tbody>
                <tr>
                  <td bgcolor="#0b131e" style="background-color: #0b131e !important; padding: 20px 30px; text-align: left;">
                    <table border="0" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="vertical-align: middle;">
                          <img src="https://avotalent.app/avotalent-logo.png" alt="AvoTalent" width="36" height="36" style="border-radius: 8px; display: block; border: 0;" />
                        </td>
                        <td style="padding-left: 12px; vertical-align: middle;">
                          <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"><span style="color: #ffffff !important;">Avo</span><span style="color: #00a86b !important;">Talent</span></span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 35px 30px 10px 30px; background-color: #ffffff !important;">
                    <h1 style="margin: 0 0 14px 0; font-size: 21px; font-weight: 700; color: #111827 !important; line-height: 1.3;">
                      Estás a un paso de ver las vacantes que hacen match contigo
                    </h1>

                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #4b5563 !important; line-height: 1.6;">
                      Hola, <strong style="color: #111827 !important;">${escapeHtml(name)}</strong> 👋
                    </p>

                    <p style="margin: 0 0 24px 0; font-size: 15px; color: #4b5563 !important; line-height: 1.6;">
                      Creaste tu cuenta en <strong style="color: #111827 !important;">AvoTalent</strong>, pero todavía no completas tu perfil. Sin él solo ves la lista general; con él, la app compara tu perfil con cada vacante y te muestra primero las que más encajan contigo.
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="background-color: #ffffff !important; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 25px;">
                      <tr>
                        <td style="padding: 20px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td>
                                <span style="background-color: #d1fae5 !important; color: #047857 !important; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">${LABELS[vacancy.label]}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-top: 10px;">
                                <a href="${escapeHtml(vacancy.url)}" target="_blank" style="font-size: 17px; font-weight: 700; color: #0f172a !important; text-decoration: none; display: block;">${escapeHtml(vacancy.title)}</a>
                                <span style="font-size: 13px; color: #64748b !important; display: block; margin-top: 4px;">${escapeHtml(vacancy.meta)}</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding-top: 14px; font-size: 13px; color: #059669 !important; font-weight: 600;">
                                🎯 Con tu perfil completo verías qué tanto encajas con ${othersText}.
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <h2 style="margin: 0 0 10px 0; font-size: 17px; font-weight: 700; color: #111827 !important; line-height: 1.3;">¿Qué son los skills y por qué te los pedimos?</h2>

                    <p style="margin: 0 0 14px 0; font-size: 15px; color: #4b5563 !important; line-height: 1.6;">
                      Los <strong style="color: #111827 !important;">skills</strong> son las tecnologías y herramientas que sabes usar (React, Python, SQL, Figma…). Cada vacante pide algunos, y AvoTalent compara los tuyos con los de la vacante para calcular tu compatibilidad:
                    </p>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#ecfdf5" style="background-color: #ecfdf5 !important; border-radius: 10px; margin-bottom: 18px;">
                      <tr>
                        <td style="padding: 14px 18px; font-size: 14px; color: #065f46 !important; line-height: 1.8;">
                          <strong>35 %</strong> tu puesto &nbsp;·&nbsp; <strong>35 %</strong> tus skills<br />
                          <strong>15 %</strong> tu nivel &nbsp;·&nbsp; <strong>15 %</strong> remoto, híbrido o presencial
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 10px 0; font-size: 15px; color: #111827 !important; font-weight: 700; line-height: 1.5;">Por qué conviene llenarlo:</p>
                    <ul style="margin: 0 0 20px 0; padding: 0 0 0 20px; font-size: 15px; color: #4b5563 !important; line-height: 1.7;">
                      <li>Ves primero las vacantes que más encajan contigo, no una lista al azar.</li>
                      <li>Sabes qué skills te faltan para la vacante que quieres.</li>
                      <li>Puedes guardar vacantes y publicar y comentar en la comunidad.</li>
                    </ul>

                    <p style="margin: 0 0 28px 0; font-size: 15px; color: #4b5563 !important; line-height: 1.6;">
                      Solo elige tu <strong style="color: #111827 !important;">puesto</strong>, tu <strong style="color: #111827 !important;">nivel</strong>, tus <strong style="color: #111827 !important;">skills</strong> y cómo prefieres trabajar. Toma un par de minutos.
                    </p>

                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto 20px auto;">
                      <tr>
                        <td align="center" bgcolor="#00a86b" style="border-radius: 8px; background-color: #00a86b !important;">
                          <a href="${escapeHtml(completeProfileUrl)}" target="_blank" style="font-size: 15px; font-weight: 700; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; border: 1px solid #00a86b; display: inline-block;">Completar mi perfil ahora →</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td bgcolor="#f8fafc" style="background-color: #f8fafc !important; padding: 20px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; color: #9ca3af !important; line-height: 1.5;">Recibes este correo porque creaste una cuenta en AvoTalent. Es un único recordatorio.</p>
                    <p style="margin: 0; font-size: 12px; color: #9ca3af !important;">© 2026 AvoTalent. Todos los derechos reservados.</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
`

  const text = [
    `Hola, ${name}:`,
    '',
    'Creaste tu cuenta en AvoTalent, pero todavía no completas tu perfil. Sin él solo ves la lista general; con él, la app compara tu perfil con cada vacante y te muestra primero las que más encajan contigo.',
    '',
    `${LABELS[vacancy.label]}: ${vacancy.title} (${vacancy.meta})`,
    vacancy.url,
    '',
    '¿Qué son los skills? Las tecnologías y herramientas que sabes usar (React, Python, SQL, Figma…). Cada vacante pide algunos y AvoTalent compara los tuyos con los de la vacante.',
    'La compatibilidad pesa: 35 % tu puesto, 35 % tus skills, 15 % tu nivel y 15 % remoto, híbrido o presencial.',
    '',
    'Completa tu perfil (puesto, nivel, skills y cómo prefieres trabajar):',
    completeProfileUrl,
    '',
    'Recibes este correo porque creaste una cuenta en AvoTalent. Es un único recordatorio.',
  ].join('\n')

  return { subject: PROFILE_REMINDER_SUBJECT, html, text }
}
