import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * Las páginas legales (aviso de privacidad, términos y cookies): se abren SIN iniciar sesión y están en el mapa del sitio. El pie de la
 * app y las pantallas de registro enlazan aquí. Los textos son borradores para revisión de un abogado: la fecha de «última actualización»
 * se pone el día en que se publican.
 */
export const LEGAL_CONTACT = 'hola@avotalent.app'
export const LEGAL_UPDATED = 'noviembre de 2026'

export const LEGAL_LINKS = [
  { href: '/privacidad', label: 'Aviso de privacidad' },
  { href: '/terminos', label: 'Términos y condiciones' },
  { href: '/cookies', label: 'Cookies y medición' },
] as const

/** Los tres enlaces legales, para el pie de la app y para las pantallas donde se piden datos. */
export function LegalLinks({ className = 'legal-links' }: { className?: string }) {
  return (
    <nav className={className} aria-label="Legales">
      {LEGAL_LINKS.map((link, index) => (
        <span key={link.href}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <Link href={link.href}>{link.label}</Link>
        </span>
      ))}
    </nav>
  )
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal-page">
      <p><Link href="/" className="legal-back">← Volver a AvoTalent</Link></p>
      <h1>{title}</h1>
      <p className="legal-updated">Última actualización: {LEGAL_UPDATED}</p>
      {children}
      <LegalLinks className="legal-links legal-links-end" />
    </main>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
