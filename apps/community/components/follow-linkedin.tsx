'use client'

import { trackEvent } from '../lib/web-analytics'
import { LINKEDIN_COMPANY_URL } from '../lib/social'

/**
 * «Síguenos en LinkedIn»: el enlace a la página de AvoTalent. Se abre en otra pestaña. Se anota el clic (`follow_linkedin_click`, con el
 * lugar donde estaba) para saber desde dónde nos siguen más.
 */
export function FollowLinkedIn({ surface, className = 'follow-linkedin' }: { surface: string; className?: string }) {
  return (
    <a
      className={className}
      href={LINKEDIN_COMPANY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => { void trackEvent('follow_linkedin_click', { surface }) }}
    >
      Síguenos en LinkedIn
    </a>
  )
}
