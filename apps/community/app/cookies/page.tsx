import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/legal-layout'

export const metadata = {
  title: 'Cookies y medición - AvoTalent',
  description: 'Qué cookies y herramientas de medición usa AvoTalent, para qué sirven y cómo puedes limitarlas.',
  alternates: { canonical: '/cookies' },
}

/**
 * Los nombres y las duraciones salen del código de AvoTalent (lo propio) y de la documentación de cada proveedor (Google Analytics y
 * Microsoft Clarity: pueden cambiar cuando ellos actualicen sus herramientas).
 */
const ROWS: { purpose: string; what: string; names: string; duration: string; who: string; needed: string }[] = [
  {
    purpose: 'Sesión',
    what: 'Mantiene tu inicio de sesión y lo renueva mientras usas la plataforma.',
    names: 'avocado_token, avocado_refresh_token y avocado_user (almacenamiento local del navegador)',
    duration: 'Hasta que cierres sesión',
    who: 'AvoTalent',
    needed: 'Sí',
  },
  {
    purpose: 'Preferencias',
    what: 'Recuerda tu tema (claro u oscuro) y el borrador de una publicación que no terminaste.',
    names: 'avotalent_theme y avo_post_draft (almacenamiento local)',
    duration: 'Hasta que las borres',
    who: 'AvoTalent',
    needed: 'Sí',
  },
  {
    purpose: 'Medición propia',
    what: 'Un identificador del navegador para contar visitas, páginas vistas y clics, y para unir tus visitas anteriores a tu cuenta cuando te registras.',
    names: '_avo_cid (cookie), avo_visitor y avo_ws (almacenamiento local)',
    duration: '_avo_cid: 2 años · avo_ws: la visita termina tras 30 minutos sin actividad',
    who: 'AvoTalent',
    needed: 'No',
  },
  {
    purpose: 'Origen de la visita',
    what: 'Guarda la fuente por la que llegaste (por ejemplo, LinkedIn o Google) durante un tiempo limitado, para saber qué canales funcionan.',
    names: 'avo_attribution (almacenamiento local)',
    duration: '30 días',
    who: 'AvoTalent',
    needed: 'No',
  },
  {
    purpose: 'Medición de uso',
    what: 'Estadísticas de visitas y uso del sitio.',
    names: '_ga y _ga_* (cookies)',
    duration: 'Hasta 2 años, según Google',
    who: 'Google Analytics',
    needed: 'No',
  },
  {
    purpose: 'Grabación de sesiones',
    what: 'Registra una muestra de sesiones (clics, desplazamientos) para detectar problemas de uso.',
    names: '_clck y _clsk (cookies)',
    duration: '_clck: hasta 1 año · _clsk: 1 día, según Microsoft',
    who: 'Microsoft Clarity',
    needed: 'No',
  },
  {
    purpose: 'Notificaciones push',
    what: 'Si las activas, el navegador guarda una suscripción para recibirlas. No es una cookie, pero es un identificador en tu dispositivo.',
    names: 'Suscripción push del navegador y avo_push_dismissed_at (almacenamiento local)',
    duration: 'Hasta que las desactives',
    who: 'AvoTalent y tu navegador',
    needed: 'No',
  },
]

export default function CookiesPage() {
  return (
    <LegalPage title="Política de cookies y medición">
      <LegalSection title="1. Qué son">
        <p>
          Las cookies y tecnologías similares son pequeños archivos o identificadores que tu navegador guarda cuando visitas un sitio. Sirven
          para recordar que iniciaste sesión y para entender cómo se usa la plataforma.
        </p>
      </LegalSection>

      <LegalSection title="2. Cuáles usamos">
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr><th>Para qué</th><th>Qué hace</th><th>Nombres</th><th>Duración</th><th>Quién la gestiona</th><th>Es necesaria</th></tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.purpose}>
                  <td><strong>{row.purpose}</strong></td>
                  <td>{row.what}</td>
                  <td>{row.names}</td>
                  <td>{row.duration}</td>
                  <td>{row.who}</td>
                  <td>{row.needed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Los nombres y las duraciones exactas de cada elemento pueden cambiar cuando actualicemos las herramientas de medición.</p>
      </LegalSection>

      <LegalSection title="3. Qué medimos">
        <p>
          Medimos páginas vistas, clics, tiempo con la pestaña visible, tipo de dispositivo, navegador, país y ciudad aproximados, la fuente de
          la visita y errores. No vendemos esta información. Se usa para mejorar la plataforma. Si no tienes cuenta, te identificamos solo por
          tu navegador. Si te registras, unimos tus visitas anteriores a tu cuenta.
        </p>
        <p>
          En los correos que te enviamos medimos los clics en sus enlaces y si se abrieron. Esto no usa una cookie de este sitio: el enlace pasa por el
          dominio de seguimiento de nuestro proveedor de correo (Resend) antes de llevarte a AvoTalent, y cada correo lleva una imagen invisible
          de 1 × 1 píxel para saber si se abrió. Está explicado en el
          <Link href="/privacidad"> Aviso de privacidad</Link>.
        </p>
      </LegalSection>

      <LegalSection title="4. Grabaciones de sesión">
        <p>
          Una muestra de sesiones se graba con Microsoft Clarity. Las usamos para ver dónde se atora la gente, no para revisar a personas
          concretas. Los campos de texto y los datos de perfil se enmascaran en las grabaciones.
        </p>
      </LegalSection>

      <LegalSection title="5. Cómo limitarlas">
        <ul>
          <li>Desde tu navegador puedes bloquear o borrar cookies. Si bloqueas las necesarias, no podrás iniciar sesión.</li>
          <li>Puedes desactivar las notificaciones push en los permisos del sitio de tu navegador.</li>
          <li>Hoy no hay un mecanismo propio para rechazar la medición ni un banner: se mide a todas las visitas.</li>
        </ul>
        <p>Más sobre cómo tratamos tus datos en el <Link href="/privacidad">Aviso de privacidad</Link>.</p>
      </LegalSection>

      <LegalSection title="6. Cambios">
        <p>
          Si cambiamos las herramientas de medición, actualizaremos esta política. Por ejemplo, antes de activar publicidad o píxeles de redes
          sociales.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
