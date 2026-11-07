import Link from 'next/link'
import { LEGAL_CONTACT, LegalPage, LegalSection } from '@/components/legal-layout'

export const metadata = {
  title: 'Términos y condiciones - AvoTalent',
  description: 'Las reglas para usar AvoTalent: tu cuenta, las vacantes, la comunidad y lo que esperamos de quien la usa.',
  alternates: { canonical: '/terminos' },
}

export default function TermsPage() {
  return (
    <LegalPage title="Términos y condiciones">
      <LegalSection title="1. Qué es AvoTalent">
        <p>
          AvoTalent es una plataforma gratuita en español para personas que buscan trabajo en tecnología. Reúne vacantes, una comunidad para
          conversar y herramientas como el perfil, la compatibilidad con vacantes y un examen de skills. Lo opera Transformateck S.A.S.
        </p>
        <p>
          Al crear una cuenta o usar la plataforma aceptas estos términos y el <Link href="/privacidad">Aviso de privacidad</Link>. Si no estás de
          acuerdo, no la uses.
        </p>
      </LegalSection>

      <LegalSection title="2. Quién puede usarla">
        <p>
          Debes tener al menos 18 años, o la mayoría de edad de tu país si es mayor. La plataforma está pensada para personas, no para empresas:
          por ahora no hay registro de empresas.
        </p>
      </LegalSection>

      <LegalSection title="3. Tu cuenta">
        <ul>
          <li>La información que des debe ser verdadera y actual.</li>
          <li>Eres responsable de lo que ocurra con tu cuenta. No la compartas.</li>
          <li>Puedes registrarte con correo, GitHub o LinkedIn, y puedes pedir que borremos tu cuenta escribiendo a <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.</li>
          <li>Podemos suspender o cerrar cuentas que incumplan estos términos o que se usen para abuso, bots o fraude.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Las vacantes">
        <ul>
          <li>Las vacantes vienen de páginas de empleo públicas de las empresas y las ponemos aquí para que sea más fácil encontrarlas. No somos la empresa que contrata.</li>
          <li>Para postularte te llevamos al sitio de la empresa. La postulación, la entrevista y la contratación son entre tú y esa empresa.</li>
          <li>Una vacante se muestra como abierta hasta 45 días después de publicarla. Puede cerrarse antes en el sitio de la empresa, y no garantizamos que siga disponible ni que sea exacta.</li>
          <li>La compatibilidad que ves es una estimación automática según tu perfil. No predice si te contratarán.</li>
          <li>No garantizamos que consigas un empleo ni una entrevista.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. La comunidad">
        <p>Todo lo que publiques (discusiones, comentarios, votos) lo pueden ver otras personas con cuenta. Al publicar:</p>
        <ul>
          <li>Eres responsable de tu contenido y tienes derecho a compartirlo.</li>
          <li>Nos das permiso de mostrarlo dentro de la plataforma mientras esté publicado.</li>
          <li>No debes publicar contenido ilegal, discriminatorio, acosador, engañoso, spam, ni datos personales de otras personas sin su permiso.</li>
          <li>No debes publicar ofertas falsas ni pedir dinero por empleos.</li>
          <li>Podemos ocultar o borrar contenido que incumpla estas reglas. Más adelante publicaremos reglas de la comunidad más detalladas.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Uso aceptable">
        <p>
          No puedes copiar la plataforma de forma masiva (scraping), usar bots, intentar acceder a datos que no son tuyos, afectar su
          funcionamiento ni usarla para fines distintos a buscar empleo y participar en la comunidad.
        </p>
      </LegalSection>

      <LegalSection title="7. Propiedad intelectual">
        <p>
          La marca, el diseño y el software de AvoTalent son nuestros. Las descripciones de las vacantes son de las empresas que las publican.
          Tu contenido sigue siendo tuyo.
        </p>
      </LegalSection>

      <LegalSection title="8. Correos y avisos">
        <p>Podemos enviarte correos del servicio y, si no los limitas, alertas de vacantes, seguimiento de tus postulaciones y un resumen semanal. Puedes apagarlos desde Ajustes.</p>
      </LegalSection>

      <LegalSection title="9. Servicio gratuito y cambios">
        <p>
          Por ahora la plataforma es gratuita. Si en el futuro ofrecemos funciones de pago, te lo avisaremos antes y no te cobraremos nada sin tu
          aceptación explícita. Podemos cambiar, pausar o retirar funciones, y actualizar estos términos; si el cambio es importante, te avisaremos.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitación de responsabilidad">
        <p>
          La plataforma se ofrece «tal como está». En la medida que lo permita la ley, no somos responsables por decisiones que tomes con base
          en las vacantes, por lo que hagan las empresas o terceros, ni por interrupciones del servicio.
        </p>
      </LegalSection>

      <LegalSection title="11. Ley aplicable y contacto">
        <p>
          Estos términos se rigen por las leyes de México. Para cualquier disputa, las partes se someten a los tribunales de Monterrey, Nuevo
          León. Para dudas o reportes, escríbenos a <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
