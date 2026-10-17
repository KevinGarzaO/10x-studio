import { CV_LANGUAGE_LEVEL_LABEL, type Cv } from '@avocado/schemas'
import { formatPeriod, formatYears, newestFirst, studiesNewestFirst, toSafeUrl } from '../../lib/cv'

/** Lo que viene del perfil (no del CV) y que la hoja necesita mostrar. */
export interface CvPreviewProfile {
  displayName: string
  /** El puesto, ya con su nivel si aplica: "Desarrollo Backend · Senior". */
  headline: string
  location?: string | null
  workModality?: string | null
  website?: string | null
  githubUrl?: string | null
  photoUrl?: string | null
  /** Los skills ya con su nombre visible, no su identificador. */
  skills: string[]
}

interface CvPreviewProps {
  profile: CvPreviewProfile
  cv: Cv
  /** Texto que se muestra cuando el CV aún no tiene nada escrito. */
  emptyHint?: string
}

function ExternalLink({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  const safe = toSafeUrl(href)
  // Lo que no es una dirección web válida se muestra como texto, nunca como enlace.
  return safe ? (
    <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>
  ) : (
    <span>{children}</span>
  )
}

/**
 * El CV como una hoja: la misma que se ve en la vista previa de ajustes y en el
 * CV en línea (/cv/[username]), y la que se imprime. Solo dibuja; no sabe de dónde
 * vienen los datos.
 */
export function CvPreview({ profile, cv, emptyHint }: CvPreviewProps) {
  const contact: { key: string; node: React.ReactNode }[] = []
  if (profile.location) contact.push({ key: 'location', node: profile.location })
  if (profile.workModality) contact.push({ key: 'modality', node: profile.workModality })
  if (cv.contactEmail) contact.push({ key: 'email', node: <a href={`mailto:${cv.contactEmail}`}>{cv.contactEmail}</a> })
  if (cv.phone) contact.push({ key: 'phone', node: cv.phone })
  if (profile.website) contact.push({ key: 'website', node: <ExternalLink href={profile.website}>{profile.website}</ExternalLink> })
  if (profile.githubUrl) contact.push({ key: 'github', node: <ExternalLink href={profile.githubUrl}>{profile.githubUrl}</ExternalLink> })
  if (cv.linkedinUrl) contact.push({ key: 'linkedin', node: <ExternalLink href={cv.linkedinUrl}>{cv.linkedinUrl}</ExternalLink> })

  const experience = newestFirst(cv.experience)
  const education = studiesNewestFirst(cv.education)
  const empty =
    !cv.summary && experience.length === 0 && education.length === 0 &&
    cv.languages.length === 0 && cv.certifications.length === 0 && cv.projects.length === 0

  return (
    <article className="cv-sheet" aria-label="Vista del CV">
      <header className="cv-head">
        {profile.photoUrl && <img className="cv-photo" src={profile.photoUrl} alt="" />}
        <div className="cv-head-main">
          <h1>{profile.displayName || 'Tu nombre'}</h1>
          {profile.headline && <p className="cv-headline">{profile.headline}</p>}
          {contact.length > 0 && (
            <ul className="cv-contact">
              {contact.map(item => <li key={item.key}>{item.node}</li>)}
            </ul>
          )}
        </div>
      </header>

      {cv.summary && (
        <section className="cv-section">
          <h2>Resumen</h2>
          <p className="cv-text">{cv.summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="cv-section">
          <h2>Experiencia</h2>
          {experience.map((job, index) => (
            <div className="cv-entry" key={`${job.company}-${job.startDate}-${index}`}>
              <div className="cv-entry-top">
                <strong>{job.position}</strong>
                <span className="cv-period">{formatPeriod(job.startDate, job.endDate)}</span>
              </div>
              <div className="cv-entry-sub">
                {job.company}{job.location ? ` · ${job.location}` : ''}
              </div>
              {job.description && <p className="cv-text">{job.description}</p>}
            </div>
          ))}
        </section>
      )}

      {education.length > 0 && (
        <section className="cv-section">
          <h2>Educación</h2>
          {education.map((study, index) => (
            <div className="cv-entry" key={`${study.institution}-${study.startYear}-${index}`}>
              <div className="cv-entry-top">
                <strong>{study.degree}{study.field ? `, ${study.field}` : ''}</strong>
                <span className="cv-period">{formatYears(study.startYear, study.endYear)}</span>
              </div>
              <div className="cv-entry-sub">{study.institution}</div>
            </div>
          ))}
        </section>
      )}

      {profile.skills.length > 0 && (
        <section className="cv-section">
          <h2>Skills</h2>
          <ul className="cv-chips">
            {profile.skills.map(skill => <li key={skill}>{skill}</li>)}
          </ul>
        </section>
      )}

      {cv.languages.length > 0 && (
        <section className="cv-section">
          <h2>Idiomas</h2>
          <ul className="cv-plain">
            {cv.languages.map((language, index) => (
              <li key={`${language.name}-${index}`}>
                <strong>{language.name}</strong> · {CV_LANGUAGE_LEVEL_LABEL[language.level]}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cv.certifications.length > 0 && (
        <section className="cv-section">
          <h2>Certificaciones</h2>
          <ul className="cv-plain">
            {cv.certifications.map((cert, index) => (
              <li key={`${cert.name}-${index}`}>
                <strong>{cert.name}</strong>
                {cert.issuer ? ` · ${cert.issuer}` : ''}
                {cert.year ? ` · ${cert.year}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {cv.projects.length > 0 && (
        <section className="cv-section">
          <h2>Proyectos</h2>
          {cv.projects.map((project, index) => (
            <div className="cv-entry" key={`${project.name}-${index}`}>
              <div className="cv-entry-top">
                <strong>{project.name}</strong>
                {project.url && <span className="cv-period"><ExternalLink href={project.url}>{project.url}</ExternalLink></span>}
              </div>
              {project.description && <p className="cv-text">{project.description}</p>}
            </div>
          ))}
        </section>
      )}

      {empty && emptyHint && <p className="cv-empty">{emptyHint}</p>}
    </article>
  )
}
