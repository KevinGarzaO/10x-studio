/**
 * ¿Se le pueden mandar a esta persona las «Novedades e invitaciones de la comunidad»? (la quinta casilla de Configuración > Notificaciones,
 * activa por defecto). Todo correo de ese tipo debe preguntar aquí ANTES de enviar: respeta la casilla y también la baja general
 * (`email_opt_out`), que es la pausa que ya existe para todo correo de AvoTalent.
 *
 * Todavía no hay ningún envío automático de este tipo (queda fuera de la fase mínima): esta función es el único punto que tendrá que usar.
 */
export function wantsCommunityNews(person: { email_opt_out?: boolean | null; email_prefs?: { community?: boolean } | null }): boolean {
  if (person.email_opt_out === true) return false
  return person.email_prefs?.community !== false
}
