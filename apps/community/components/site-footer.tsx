'use client'

import Link from 'next/link'
import { Mail } from 'lucide-react'
import { trackEvent } from '../lib/web-analytics'
import { LINKEDIN_COMPANY_URL } from '../lib/social'
import { LEGAL_CONTACT, LEGAL_LINKS } from './legal-layout'

/**
 * El pie de todas las pantallas (con o sin sesión): quiénes somos en una línea, a dónde ir, los legales, el contacto y el botón para seguir a
 * AvoTalent en LinkedIn. Solo enlaces que existen y se abren sin iniciar sesión (los de cuenta se ofrecen según quien lo mira).
 */
const LINKEDIN_GLYPH = 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z'

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" className="site-footer-logo" aria-label="AvoTalent">
            <img className="brand-mark" src="/avotalent-logo.png" alt="" aria-hidden="true" />
            <span><span className="brand-avo">Avo</span><span className="brand-accent">Talent</span></span>
          </Link>
          <p>La comunidad en español donde las conversaciones técnicas encuentran nuevas oportunidades laborales.</p>
          <a
            className="site-footer-follow"
            href={LINKEDIN_COMPANY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => { void trackEvent('follow_linkedin_click', { surface: 'footer' }) }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={LINKEDIN_GLYPH} /></svg>
            Síguenos en LinkedIn
          </a>
        </div>

        <nav className="site-footer-col" aria-label="Explorar">
          <h2>Explorar</h2>
          <ul>
            <li><Link href="/empleos">Vacantes por skill</Link></li>
            <li><Link href="/puestos">Vacantes por puesto</Link></li>
            {signedIn ? <li><Link href="/postulaciones">Mis postulaciones</Link></li> : <li><Link href="/signup">Crear cuenta gratis</Link></li>}
          </ul>
        </nav>

        <nav className="site-footer-col" aria-label="Legales">
          <h2>Legal</h2>
          <ul>
            {LEGAL_LINKS.map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}
          </ul>
        </nav>

        <div className="site-footer-col">
          <h2>Contacto</h2>
          <ul>
            <li><a href={`mailto:${LEGAL_CONTACT}`}><Mail size={14} aria-hidden="true" /> {LEGAL_CONTACT}</a></li>
          </ul>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} AvoTalent. Todos los derechos reservados.</span>
      </div>
    </footer>
  )
}
