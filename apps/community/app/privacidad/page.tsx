import Link from 'next/link'
import { LEGAL_CONTACT, LegalPage, LegalSection } from '@/components/legal-layout'

export const metadata = {
  title: 'Aviso de privacidad - AvoTalent',
  description: 'Qué datos recabamos en AvoTalent, para qué los usamos, con quién los compartimos y cómo puedes ejercer tus derechos.',
  alternates: { canonical: '/privacidad' },
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Aviso de privacidad">
      <LegalSection title="1. Quién es responsable de tus datos">
        <p>
          Transformateck S.A.S. (en adelante, «AvoTalent») es responsable del tratamiento de tus datos personales. Domicilio: Calzada del Valle,
          San Pedro. Correo para asuntos de privacidad y derechos: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Qué datos recabamos">
        <p>Recabamos solo lo necesario para que la plataforma funcione. Según cómo la uses, son:</p>
        <ul>
          <li><strong>Cuenta:</strong> correo electrónico, nombre y foto que nos da el método con el que te registras (correo, GitHub o LinkedIn).</li>
          <li><strong>Perfil:</strong> puesto, nivel, ciudad, modalidad de trabajo preferida, skills y la información que decidas agregar.</li>
          <li><strong>CV en línea:</strong> el currículum que armes en tu perfil. Es privado por defecto.</li>
          <li><strong>Actividad en la comunidad:</strong> discusiones, comentarios y votos que publiques.</li>
          <li><strong>Postulaciones:</strong> las vacantes a las que sales a postularte y lo que nos cuentas sobre ellas (por ejemplo, si ya te postulaste y cómo va).</li>
          <li><strong>Examen de skills:</strong> tus respuestas y resultados, si lo presentas.</li>
          <li><strong>Uso de la plataforma:</strong> páginas que visitas, clics, tiempo de uso, tipo de dispositivo, navegador, país y ciudad aproximados, y la fuente por la que llegaste (por ejemplo, LinkedIn o Google). Lo medimos con herramientas propias y con Google Analytics.</li>
          <li><strong>Grabaciones de sesión:</strong> una muestra de sesiones se graba con Microsoft Clarity para entender dónde se atoran las personas. Los campos de texto y los datos de perfil se enmascaran en las grabaciones.</li>
          <li><strong>Avisos:</strong> si activas notificaciones push, guardamos el identificador de tu dispositivo para enviártelas.</li>
          <li><strong>Comentarios que nos envíes:</strong> opiniones y respuestas a formularios de la plataforma, que guardamos ligados a tu cuenta.</li>
          <li><strong>Comunicaciones:</strong> registramos los correos que te enviamos y si se entregaron.</li>
        </ul>
        <p>
          No pedimos datos personales sensibles (salud, origen étnico, religión, orientación sexual, afiliación política o sindical). Te pedimos
          que no los incluyas en tu perfil, CV ni publicaciones.
        </p>
      </LegalSection>

      <LegalSection title="3. Para qué los usamos">
        <p><strong>Finalidades necesarias para darte el servicio:</strong></p>
        <ul>
          <li>Crear y administrar tu cuenta.</li>
          <li>Mostrarte vacantes y calcular qué tan compatibles son contigo.</li>
          <li>Permitirte participar en la comunidad.</li>
          <li>Enviarte correos del servicio (confirmación de cuenta, recordatorio de completar tu perfil).</li>
          <li>Mantener la seguridad y evitar abuso o bots.</li>
        </ul>
        <p><strong>Finalidades adicionales,</strong> que puedes limitar escribiéndonos al correo de arriba o desde Ajustes:</p>
        <ul>
          <li>Enviarte alertas de vacantes que te pueden interesar, un resumen semanal, seguimiento de tus postulaciones y avisos push.</li>
          <li>Medir y mejorar la plataforma (qué funciona, qué no, qué tan rápido carga).</li>
          <li>Pedirte tu opinión para mejorar el producto.</li>
          <li>Invitaciones por correo a personas suscritas al newsletter de Kevin Garza, máximo 2 correos por persona; después no se les vuelve a escribir.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Con quién compartimos o a quién encargamos datos">
        <p>No vendemos tus datos. Usamos proveedores que tratan datos por nuestra cuenta, entre ellos:</p>
        <ul>
          <li><strong>Alojamiento y base de datos:</strong> Supabase (Estados Unidos) y Railway.</li>
          <li><strong>Sitio web:</strong> Vercel.</li>
          <li><strong>Envío de correos:</strong> Resend.</li>
          <li><strong>Medición de uso:</strong> Google Analytics (Google).</li>
          <li><strong>Grabaciones de sesión:</strong> Microsoft Clarity.</li>
          <li><strong>Inicio de sesión:</strong> GitHub y LinkedIn, según el método que elijas.</li>
        </ul>
        <p>
          Algunos de estos proveedores procesan datos fuera de México; la base de datos está en Estados Unidos. Tus datos de perfil visibles
          (por ejemplo, tus discusiones) los pueden ver otras personas con cuenta.
        </p>
        <p>
          Tu CV en línea es privado por defecto: solo tú lo ves dentro de la plataforma y ninguna pantalla del equipo lo muestra. Si decides
          hacerlo público, cualquier persona que tenga el enlace puede verlo, aunque no tenga cuenta.
        </p>
        <p>Cuando te postulas a una vacante, te llevamos al sitio de la empresa. Lo que envíes ahí lo trata esa empresa según su propio aviso.</p>
      </LegalSection>

      <LegalSection title="5. Tus derechos">
        <p>
          Puedes acceder a tus datos, rectificarlos si están incompletos o mal, cancelarlos, oponerte a su uso y revocar el consentimiento que
          hayas dado. Para ejercerlos, escribe a <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> con tu nombre, el correo de tu cuenta y qué
          quieres hacer. Te responderemos en un máximo de 7 días hábiles. Si no te parece nuestra respuesta, puedes acudir a la autoridad en
          materia de protección de datos personales de particulares en México.
        </p>
      </LegalSection>

      <LegalSection title="6. Cuánto tiempo guardamos tus datos">
        <p>
          Guardamos tus datos mientras tengas cuenta. Para borrar tu cuenta escríbenos a <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>: al
          atender tu solicitud, tu información se da de baja del sistema. Tus discusiones y comentarios ya publicados no se borran: quedan como
          «un miembro de la comunidad» y no se les da más difusión. Algunos datos de uso pueden conservarse sin identificarte para estadísticas.
        </p>
      </LegalSection>

      <LegalSection title="7. Menores de edad">
        <p>AvoTalent es para personas de 18 años o más, o con la mayoría de edad de su país si es mayor. Si detectamos una cuenta de una persona menor, la eliminamos.</p>
      </LegalSection>

      <LegalSection title="8. Cookies y tecnologías similares">
        <p>Usamos cookies y herramientas de medición. Lee la <Link href="/cookies">Política de cookies y medición</Link> para saber cuáles y cómo limitarlas.</p>
      </LegalSection>

      <LegalSection title="9. Cambios a este aviso">
        <p>
          Si cambiamos este aviso te lo diremos en la plataforma y, cuando el cambio sea importante, por correo. La fecha de arriba indica la
          última versión.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
