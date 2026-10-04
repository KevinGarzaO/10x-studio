import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { emptyCv, CV_LIMITS, cvSchema, type Cv } from '@avocado/schemas'
import { CvForm } from '@/components/cv/CvForm'

/** Con estado real: así se ejercita lo que ve la persona, no solo las llamadas. */
function Harness({ initial = emptyCv(), onChange }: { initial?: Cv; onChange?: (cv: Cv) => void }) {
  const [cv, setCv] = useState<Cv>(initial)
  return (
    <>
      <CvForm value={cv} onChange={next => { setCv(next); onChange?.(next) }} />
      <output data-testid="state">{JSON.stringify(cv)}</output>
    </>
  )
}

const state = (): Cv => JSON.parse(screen.getByTestId('state').textContent || '{}')

describe('CvForm sections', () => {
  it('has a section for everything a CV needs', () => {
    render(<Harness />)

    for (const name of ['Resumen', 'Contacto', 'Experiencia', 'Educación', 'Idiomas', 'Certificaciones', 'Proyectos']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
  })

  it('starts empty and does not invent entries', () => {
    render(<Harness />)

    expect(screen.queryByLabelText(/Puesto \(experiencia 1\)/)).toBeNull()
    expect(state().experience).toEqual([])
  })
})

describe('summary and contact', () => {
  it('writes the summary and counts the characters', () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Hola mundo' } })

    expect(state().summary).toBe('Hola mundo')
    expect(screen.getByText('10/1200')).toBeTruthy()
  })

  it('captures the contact email, phone and LinkedIn', () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('Correo de contacto'), { target: { value: 'ana@correo.com' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '+52 81 1234' } })
    fireEvent.change(screen.getByLabelText('LinkedIn'), { target: { value: 'linkedin.com/in/ana' } })

    expect(state()).toMatchObject({ contactEmail: 'ana@correo.com', phone: '+52 81 1234', linkedinUrl: 'linkedin.com/in/ana' })
  })
})

describe('experience', () => {
  it('adds a blank entry and fills it in', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /Agregar experiencia/ }))
    fireEvent.change(screen.getByLabelText('Puesto (experiencia 1)'), { target: { value: 'Backend Engineer' } })
    fireEvent.change(screen.getByLabelText('Empresa (experiencia 1)'), { target: { value: 'Stripe' } })
    fireEvent.change(screen.getByLabelText('Inicio (experiencia 1)'), { target: { value: '2022-03' } })

    expect(state().experience).toEqual([
      { company: 'Stripe', position: 'Backend Engineer', location: '', startDate: '2022-03', endDate: null, description: '' },
    ])
  })

  it('treats a new entry as the current job until an end date is chosen', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /Agregar experiencia/ }))

    expect((screen.getByLabelText('Trabajo actual (experiencia 1)') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Fin (experiencia 1)') as HTMLInputElement).disabled).toBe(true)
  })

  it('lets someone say the job ended, and go back to "current"', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Agregar experiencia/ }))

    fireEvent.click(screen.getByLabelText('Trabajo actual (experiencia 1)'))
    const end = screen.getByLabelText('Fin (experiencia 1)') as HTMLInputElement
    expect(end.disabled).toBe(false)
    fireEvent.change(end, { target: { value: '2024-06' } })
    expect(state().experience[0].endDate).toBe('2024-06')

    fireEvent.click(screen.getByLabelText('Trabajo actual (experiencia 1)'))
    expect(state().experience[0].endDate).toBeNull()
  })

  it('removes only the entry it was asked to', () => {
    const initial = cvSchema.parse({
      experience: [
        { company: 'A', position: 'Uno', startDate: '2020-01' },
        { company: 'B', position: 'Dos', startDate: '2021-01' },
      ],
    })
    render(<Harness initial={initial} />)

    fireEvent.click(screen.getByRole('button', { name: 'Quitar experiencia 1' }))

    expect(state().experience.map(job => job.company)).toEqual(['B'])
  })

  it('stops offering more entries at the limit', () => {
    const full = cvSchema.parse({
      experience: Array.from({ length: CV_LIMITS.experience }, (_, i) => ({ company: `E${i}`, position: 'Dev', startDate: '2020-01' })),
    })
    render(<Harness initial={full} />)

    expect((screen.getByRole('button', { name: /Agregar experiencia/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('education, languages, certifications and projects', () => {
  it('adds and fills a study, with "still studying" by default', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /Agregar estudio/ }))
    fireEvent.change(screen.getByLabelText('Institución (estudio 1)'), { target: { value: 'UANL' } })
    fireEvent.change(screen.getByLabelText('Título o grado (estudio 1)'), { target: { value: 'Ingeniería' } })
    fireEvent.change(screen.getByLabelText('Año de inicio (estudio 1)'), { target: { value: '2012' } })

    expect(state().education[0]).toMatchObject({ institution: 'UANL', degree: 'Ingeniería', startYear: '2012', endYear: null })

    fireEvent.click(screen.getByLabelText('Sigo estudiando (estudio 1)'))
    fireEvent.change(screen.getByLabelText('Año de fin (estudio 1)'), { target: { value: '2016' } })
    expect(state().education[0].endYear).toBe('2016')
  })

  it('adds a language with its level', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /Agregar idioma/ }))
    fireEvent.change(screen.getByLabelText('Idioma (idioma 1)'), { target: { value: 'Inglés' } })
    fireEvent.change(screen.getByLabelText('Nivel (idioma 1)'), { target: { value: 'nativo' } })

    expect(state().languages).toEqual([{ name: 'Inglés', level: 'nativo' }])
  })

  it('offers the four language levels in Spanish', () => {
    render(<Harness initial={cvSchema.parse({ languages: [{ name: 'Inglés', level: 'basico' }] })} />)

    const options = [...(screen.getByLabelText('Nivel (idioma 1)') as HTMLSelectElement).options].map(o => o.textContent)
    expect(options).toEqual(['Básico', 'Intermedio', 'Avanzado', 'Nativo'])
  })

  it('adds a certification and a project', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /Agregar certificación/ }))
    fireEvent.change(screen.getByLabelText('Nombre (certificación 1)'), { target: { value: 'AWS SA' } })
    fireEvent.change(screen.getByLabelText('Año (certificación 1)'), { target: { value: '2023' } })

    fireEvent.click(screen.getByRole('button', { name: /Agregar proyecto/ }))
    fireEvent.change(screen.getByLabelText('Nombre (proyecto 1)'), { target: { value: 'AvoTalent' } })
    fireEvent.change(screen.getByLabelText('Enlace (proyecto 1)'), { target: { value: 'avotalent.io' } })

    expect(state().certifications[0]).toMatchObject({ name: 'AWS SA', year: '2023' })
    expect(state().projects[0]).toMatchObject({ name: 'AvoTalent', url: 'avotalent.io' })
  })

  it('reports every change upward and keeps what the other sections hold', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Hola' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar idioma/ }))

    const last = onChange.mock.calls.at(-1)![0] as Cv
    expect(last.summary).toBe('Hola')
    expect(last.languages).toHaveLength(1)
  })
})
