export const metadata = {
  title: 'Política de Privacidad - AvoTalent',
  description: 'Política de privacidad de AvoTalent - Comunidad Global de Talento',
}

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px', color: '#c9d1d9' }}>
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>Política de Privacidad</h1>
      <p style={{ color: '#8b949e', marginBottom: 24 }}>Última actualización: 5 de septiembre de 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>1. Información que recopilamos</h2>
        <p style={{ lineHeight: 1.7, marginBottom: 12 }}>
          AvoTalent recopila información que usted nos proporciona directamente al crear una cuenta, publicar vacantes o interactuar con la plataforma. Esto incluye:
        </p>
        <ul style={{ lineHeight: 1.7, paddingLeft: 24 }}>
          <li>Nombre y apellidos</li>
          <li>Dirección de correo electrónico</li>
          <li>Foto de perfil (opcional)</li>
          <li>Información profesional (habilidades, experiencia, tarifas)</li>
          <li>Información de contacto publicada en vacantes (emails, teléfonos, WhatsApp)</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>2. Uso de la información</h2>
        <p style={{ lineHeight: 1.7 }}>
          Utilizamos su información para: proporcionar y mejorar nuestros servicios, conectar candidatos con empleadores, generar contenido en LinkedIn y otras plataformas, y enviar comunicaciones relacionadas con su cuenta.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>3. Compartir información</h2>
        <p style={{ lineHeight: 1.7 }}>
          No vendemos su información personal. Compartimos información de contacto de vacantes solo con usuarios registrados de AvoTalent. La información pública de su perfil puede ser visible para otros usuarios de la plataforma.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>4. Seguridad</h2>
        <p style={{ lineHeight: 1.7 }}>
          Implementamos medidas de seguridad técnicas y organizativas para proteger su información personal contra acceso no autorizado, pérdida o alteración.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>5. Sus derechos</h2>
        <p style={{ lineHeight: 1.7 }}>
          Usted tiene derecho a acceder, rectificar, eliminar o portar su información personal. Para ejercer estos derechos, contáctenos a través de los medios disponibles en la plataforma.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>6. Cookies</h2>
        <p style={{ lineHeight: 1.7 }}>
          Utilizamos cookies y tecnologías similares para mantener su sesión, recordar sus preferencias y analizar el uso de la plataforma.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>7. Cambios en esta política</h2>
        <p style={{ lineHeight: 1.7 }}>
          Nos reservamos el derecho de actualizar esta política de privacidad. Los cambios significativos se notificarán a través de la plataforma o por correo electrónico.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>8. Contacto</h2>
        <p style={{ lineHeight: 1.7 }}>
          Si tiene preguntas sobre esta política de privacidad, puede contactarnos a través de los canales disponibles en avotalent.io.
        </p>
      </section>
    </main>
  )
}
