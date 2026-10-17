'use client'

import { Plus, Trash2 } from 'lucide-react'
import { CV_LANGUAGE_LEVELS, CV_LANGUAGE_LEVEL_LABEL, CV_LIMITS, type Cv } from '@avocado/schemas'
import { newCertification, newEducation, newExperience, newLanguage, newProject } from '../../lib/cv'

interface CvFormProps {
  value: Cv
  onChange: (cv: Cv) => void
}

function updateAt<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** Un bloque del formulario: título, entradas y el botón para agregar otra. */
function Section({
  title,
  hint,
  addLabel,
  count,
  limit,
  onAdd,
  children,
}: {
  title: string
  hint?: string
  addLabel: string
  count: number
  limit: number
  onAdd: () => void
  children: React.ReactNode
}) {
  const full = count >= limit
  return (
    <section className="cv-form-section" aria-label={title}>
      <div className="cv-form-section-head">
        <h3>{title}</h3>
        {hint && <p className="muted">{hint}</p>}
      </div>
      {children}
      <button type="button" className="outline-btn cv-add" onClick={onAdd} disabled={full} title={full ? `Máximo ${limit}` : undefined}>
        <Plus size={14} /> {addLabel}
      </button>
    </section>
  )
}

/** La tarjeta de una entrada, con su botón para quitarla. */
function Entry({ label, onRemove, children }: { label: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="cv-form-entry">
      <div className="cv-form-grid">{children}</div>
      <button type="button" className="cv-remove" onClick={onRemove} aria-label={`Quitar ${label}`}>
        <Trash2 size={14} /> Quitar
      </button>
    </div>
  )
}

function Field({ label, required, children, wide }: { label: string; required?: boolean; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`cv-field${wide ? ' is-wide' : ''}`}>
      <span>{label}{required && <em aria-hidden="true"> *</em>}</span>
      {children}
    </label>
  )
}

/**
 * El formulario del CV, por secciones. Es controlado: no guarda nada por su cuenta,
 * cada cambio sale por `onChange` y quien lo usa decide cuándo guardar. Las
 * entradas nuevas nacen en blanco; lo que falte se señala al guardar.
 */
export function CvForm({ value, onChange }: CvFormProps) {
  const set = (patch: Partial<Cv>) => onChange({ ...value, ...patch })

  return (
    <div className="cv-form">
      <section className="cv-form-section" aria-label="Resumen">
        <div className="cv-form-section-head">
          <h3>Resumen</h3>
          <p className="muted">Dos o tres líneas sobre quién eres y qué buscas. Es lo primero que se lee.</p>
        </div>
        <Field label="Resumen profesional" wide>
          <textarea
            aria-label="Resumen profesional"
            value={value.summary}
            maxLength={1200}
            rows={4}
            placeholder="Ej. Ingeniero backend con 6 años de experiencia construyendo APIs para fintech..."
            onChange={e => set({ summary: e.target.value })}
          />
          <small className="cv-counter">{value.summary.length}/1200</small>
        </Field>
      </section>

      <section className="cv-form-section" aria-label="Contacto">
        <div className="cv-form-section-head">
          <h3>Contacto</h3>
          <p className="muted">Lo que escribas aquí se muestra en tu CV. Tu correo de la cuenta no se comparte.</p>
        </div>
        <div className="cv-form-grid">
          <Field label="Correo de contacto">
            <input type="email" value={value.contactEmail} placeholder="tu@correo.com" onChange={e => set({ contactEmail: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <input type="tel" value={value.phone} placeholder="+52 81 1234 5678" onChange={e => set({ phone: e.target.value })} />
          </Field>
          <Field label="LinkedIn" wide>
            <input value={value.linkedinUrl} placeholder="linkedin.com/in/tu-usuario" onChange={e => set({ linkedinUrl: e.target.value })} />
          </Field>
        </div>
      </section>

      <Section
        title="Experiencia"
        hint="Empieza por lo más reciente; se ordena sola."
        addLabel="Agregar experiencia"
        count={value.experience.length}
        limit={CV_LIMITS.experience}
        onAdd={() => set({ experience: [...value.experience, newExperience()] })}
      >
        {value.experience.map((job, i) => (
          <Entry key={i} label={`experiencia ${i + 1}`} onRemove={() => set({ experience: removeAt(value.experience, i) })}>
            <Field label="Puesto" required>
              <input aria-label={`Puesto (experiencia ${i + 1})`} value={job.position} onChange={e => set({ experience: updateAt(value.experience, i, { position: e.target.value }) })} />
            </Field>
            <Field label="Empresa" required>
              <input aria-label={`Empresa (experiencia ${i + 1})`} value={job.company} onChange={e => set({ experience: updateAt(value.experience, i, { company: e.target.value }) })} />
            </Field>
            <Field label="Ubicación">
              <input aria-label={`Ubicación (experiencia ${i + 1})`} value={job.location} onChange={e => set({ experience: updateAt(value.experience, i, { location: e.target.value }) })} />
            </Field>
            <Field label="Inicio" required>
              <input type="month" aria-label={`Inicio (experiencia ${i + 1})`} value={job.startDate} onChange={e => set({ experience: updateAt(value.experience, i, { startDate: e.target.value }) })} />
            </Field>
            <Field label="Fin">
              <input
                type="month"
                aria-label={`Fin (experiencia ${i + 1})`}
                value={job.endDate ?? ''}
                disabled={job.endDate === null}
                onChange={e => set({ experience: updateAt(value.experience, i, { endDate: e.target.value }) })}
              />
            </Field>
            <label className="cv-check">
              <input
                type="checkbox"
                aria-label={`Trabajo actual (experiencia ${i + 1})`}
                checked={job.endDate === null}
                onChange={e => set({ experience: updateAt(value.experience, i, { endDate: e.target.checked ? null : '' }) })}
              />
              <span>Trabajo actual</span>
            </label>
            <Field label="Qué hiciste" wide>
              <textarea
                aria-label={`Descripción (experiencia ${i + 1})`}
                rows={3}
                maxLength={1500}
                value={job.description}
                onChange={e => set({ experience: updateAt(value.experience, i, { description: e.target.value }) })}
              />
            </Field>
          </Entry>
        ))}
      </Section>

      <Section
        title="Educación"
        addLabel="Agregar estudio"
        count={value.education.length}
        limit={CV_LIMITS.education}
        onAdd={() => set({ education: [...value.education, newEducation()] })}
      >
        {value.education.map((study, i) => (
          <Entry key={i} label={`estudio ${i + 1}`} onRemove={() => set({ education: removeAt(value.education, i) })}>
            <Field label="Institución" required>
              <input aria-label={`Institución (estudio ${i + 1})`} value={study.institution} onChange={e => set({ education: updateAt(value.education, i, { institution: e.target.value }) })} />
            </Field>
            <Field label="Título o grado" required>
              <input aria-label={`Título o grado (estudio ${i + 1})`} value={study.degree} onChange={e => set({ education: updateAt(value.education, i, { degree: e.target.value }) })} />
            </Field>
            <Field label="Área de estudio">
              <input aria-label={`Área de estudio (estudio ${i + 1})`} value={study.field} onChange={e => set({ education: updateAt(value.education, i, { field: e.target.value }) })} />
            </Field>
            <Field label="Año de inicio" required>
              <input type="number" min={1950} max={2100} aria-label={`Año de inicio (estudio ${i + 1})`} value={study.startYear} onChange={e => set({ education: updateAt(value.education, i, { startYear: e.target.value }) })} />
            </Field>
            <Field label="Año de fin">
              <input
                type="number"
                min={1950}
                max={2100}
                aria-label={`Año de fin (estudio ${i + 1})`}
                value={study.endYear ?? ''}
                disabled={study.endYear === null}
                onChange={e => set({ education: updateAt(value.education, i, { endYear: e.target.value }) })}
              />
            </Field>
            <label className="cv-check">
              <input
                type="checkbox"
                aria-label={`Sigo estudiando (estudio ${i + 1})`}
                checked={study.endYear === null}
                onChange={e => set({ education: updateAt(value.education, i, { endYear: e.target.checked ? null : '' }) })}
              />
              <span>Sigo estudiando</span>
            </label>
          </Entry>
        ))}
      </Section>

      <Section
        title="Idiomas"
        addLabel="Agregar idioma"
        count={value.languages.length}
        limit={CV_LIMITS.languages}
        onAdd={() => set({ languages: [...value.languages, newLanguage()] })}
      >
        {value.languages.map((language, i) => (
          <Entry key={i} label={`idioma ${i + 1}`} onRemove={() => set({ languages: removeAt(value.languages, i) })}>
            <Field label="Idioma" required>
              <input aria-label={`Idioma (idioma ${i + 1})`} value={language.name} onChange={e => set({ languages: updateAt(value.languages, i, { name: e.target.value }) })} />
            </Field>
            <Field label="Nivel">
              <select aria-label={`Nivel (idioma ${i + 1})`} value={language.level} onChange={e => set({ languages: updateAt(value.languages, i, { level: e.target.value as typeof language.level }) })}>
                {CV_LANGUAGE_LEVELS.map(level => <option key={level} value={level}>{CV_LANGUAGE_LEVEL_LABEL[level]}</option>)}
              </select>
            </Field>
          </Entry>
        ))}
      </Section>

      <Section
        title="Certificaciones"
        addLabel="Agregar certificación"
        count={value.certifications.length}
        limit={CV_LIMITS.certifications}
        onAdd={() => set({ certifications: [...value.certifications, newCertification()] })}
      >
        {value.certifications.map((cert, i) => (
          <Entry key={i} label={`certificación ${i + 1}`} onRemove={() => set({ certifications: removeAt(value.certifications, i) })}>
            <Field label="Nombre" required>
              <input aria-label={`Nombre (certificación ${i + 1})`} value={cert.name} onChange={e => set({ certifications: updateAt(value.certifications, i, { name: e.target.value }) })} />
            </Field>
            <Field label="Emitida por">
              <input aria-label={`Emitida por (certificación ${i + 1})`} value={cert.issuer} onChange={e => set({ certifications: updateAt(value.certifications, i, { issuer: e.target.value }) })} />
            </Field>
            <Field label="Año">
              <input type="number" min={1950} max={2100} aria-label={`Año (certificación ${i + 1})`} value={cert.year} onChange={e => set({ certifications: updateAt(value.certifications, i, { year: e.target.value }) })} />
            </Field>
          </Entry>
        ))}
      </Section>

      <Section
        title="Proyectos"
        addLabel="Agregar proyecto"
        count={value.projects.length}
        limit={CV_LIMITS.projects}
        onAdd={() => set({ projects: [...value.projects, newProject()] })}
      >
        {value.projects.map((project, i) => (
          <Entry key={i} label={`proyecto ${i + 1}`} onRemove={() => set({ projects: removeAt(value.projects, i) })}>
            <Field label="Nombre" required>
              <input aria-label={`Nombre (proyecto ${i + 1})`} value={project.name} onChange={e => set({ projects: updateAt(value.projects, i, { name: e.target.value }) })} />
            </Field>
            <Field label="Enlace">
              <input aria-label={`Enlace (proyecto ${i + 1})`} value={project.url} placeholder="github.com/tu-usuario/proyecto" onChange={e => set({ projects: updateAt(value.projects, i, { url: e.target.value }) })} />
            </Field>
            <Field label="Descripción" wide>
              <textarea aria-label={`Descripción (proyecto ${i + 1})`} rows={3} maxLength={800} value={project.description} onChange={e => set({ projects: updateAt(value.projects, i, { description: e.target.value }) })} />
            </Field>
          </Entry>
        ))}
      </Section>
    </div>
  )
}
