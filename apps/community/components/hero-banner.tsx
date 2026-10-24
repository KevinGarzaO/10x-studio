'use client'

import Link from 'next/link'

// Lo que ve quien no tiene cuenta en las pantallas de la app: qué es AvoTalent y cómo entrar. Las
// vacantes, las empresas y las conversaciones son solo para miembros, así que aquí no se muestra
// ninguna (ni logos de empresas).
export function HeroBanner() {
  return (
    <section className="hero-banner">
      <div className="hero-content">
        <h1>Conecta con la comunidad tech de LatAm y encuentra tu próxima vacante</h1>
        <p className="hero-subtitle">
          Discusiones reales entre developers y vacantes verificadas directo de empresas, actualizadas todos los días.
          Crea tu cuenta gratis para verlas.
        </p>
        <div className="hero-actions">
          <Link href="/signup" className="hero-btn-primary">Crear cuenta gratis</Link>
          <Link href="/login" className="hero-btn-secondary">Iniciar sesión</Link>
        </div>
      </div>
    </section>
  )
}
