import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { cvSchema, emptyCv } from '@avocado/schemas'
import { CvPreview, type CvPreviewProfile } from '@/components/cv/CvPreview'

const profile: CvPreviewProfile = {
  displayName: 'Ana Pérez',
  headline: 'Desarrollo Backend · Senior',
  location: 'Monterrey, MX',
  workModality: 'Remoto',
  website: 'anaperez.dev',
  githubUrl: 'github.com/ana',
  photoUrl: 'https://x/a.png',
  skills: ['Node.js', 'PostgreSQL'],
}

const fullCv = cvSchema.parse({
  summary: 'Ingeniera con 6 años de experiencia.',
  contactEmail: 'ana@correo.com',
  phone: '+52 81 1234 5678',
  linkedinUrl: 'linkedin.com/in/ana',
  experience: [
    { company: 'Vieja SA', position: 'Junior Dev', startDate: '2016-01', endDate: '2018-12', description: 'Escribí cosas' },
    { company: 'Stripe', position: 'Backend Engineer', location: 'Remoto', startDate: '2022-03', endDate: null, description: 'Construí APIs' },
  ],
  education: [{ institution: 'UANL', degree: 'Ingeniería en Sistemas', field: 'Computación', startYear: '2012', endYear: '2016' }],
  languages: [{ name: 'Inglés', level: 'avanzado' }],
  certifications: [{ name: 'AWS Solutions Architect', issuer: 'Amazon', year: '2023' }],
  projects: [{ name: 'AvoTalent', url: 'avotalent.io', description: 'Bolsa de trabajo' }],
})

const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement

describe('CvPreview', () => {
  it('draws the header with the name, the role and the contact data', () => {
    render(<CvPreview profile={profile} cv={fullCv} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeTruthy()
    expect(screen.getByText('Desarrollo Backend · Senior')).toBeTruthy()
    for (const text of ['Monterrey, MX', 'Remoto', 'ana@correo.com', '+52 81 1234 5678']) {
      expect(screen.getByText(text)).toBeTruthy()
    }
  })

  it('shows every section when the CV has everything', () => {
    render(<CvPreview profile={profile} cv={fullCv} />)

    for (const title of ['Resumen', 'Experiencia', 'Educación', 'Skills', 'Idiomas', 'Certificaciones', 'Proyectos']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
    expect(screen.getByText('Ingeniera con 6 años de experiencia.')).toBeTruthy()
    expect(within(section('Idiomas')).getByText(/Avanzado/)).toBeTruthy()
    expect(within(section('Skills')).getByText('Node.js')).toBeTruthy()
  })

  it('lists the most recent experience first and marks the current one', () => {
    render(<CvPreview profile={profile} cv={fullCv} />)

    const text = section('Experiencia').textContent || ''
    expect(text.indexOf('Backend Engineer')).toBeLessThan(text.indexOf('Junior Dev'))
    expect(text).toContain('mar 2022 – Actual')
    expect(text).toContain('ene 2016 – dic 2018')
    expect(text).toContain('Stripe · Remoto')
  })

  it('writes the study with its field and years', () => {
    render(<CvPreview profile={profile} cv={fullCv} />)

    expect(section('Educación').textContent).toContain('Ingeniería en Sistemas, Computación')
    expect(section('Educación').textContent).toContain('2012 – 2016')
  })

  it('leaves out the sections that have nothing in them', () => {
    render(<CvPreview profile={{ ...profile, skills: [] }} cv={emptyCv()} />)

    for (const title of ['Resumen', 'Experiencia', 'Educación', 'Skills', 'Idiomas', 'Certificaciones', 'Proyectos']) {
      expect(screen.queryByRole('heading', { name: title })).toBeNull()
    }
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeTruthy()
  })

  it('shows the hint when the CV is empty, and only then', () => {
    const { rerender } = render(<CvPreview profile={profile} cv={emptyCv()} emptyHint="Aún no hay nada" />)
    expect(screen.getByText('Aún no hay nada')).toBeTruthy()

    rerender(<CvPreview profile={profile} cv={fullCv} emptyHint="Aún no hay nada" />)
    expect(screen.queryByText('Aún no hay nada')).toBeNull()
  })

  it('falls back to a placeholder when there is no name yet', () => {
    render(<CvPreview profile={{ ...profile, displayName: '' }} cv={emptyCv()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Tu nombre' })).toBeTruthy()
  })

  describe('links', () => {
    it('opens the links in a new tab without leaking the opener', () => {
      render(<CvPreview profile={profile} cv={fullCv} />)

      const github = screen.getByRole('link', { name: 'github.com/ana' })
      expect(github.getAttribute('href')).toBe('https://github.com/ana')
      expect(github.getAttribute('target')).toBe('_blank')
      expect(github.getAttribute('rel')).toContain('noopener')
      expect(screen.getByRole('link', { name: 'ana@correo.com' }).getAttribute('href')).toBe('mailto:ana@correo.com')
    })

    it('never turns a script URL into a link', () => {
      // El esquema ya lo rechaza al guardar; esto es la segunda barrera si un documento
      // viejo o escrito directo en la base lo trajera.
      const hostile = { ...fullCv, linkedinUrl: 'javascript:alert(1)//.com', projects: [{ name: 'X', url: 'javascript:alert(1)//.com', description: '' }] }
      const { container } = render(<CvPreview profile={{ ...profile, website: 'javascript:alert(1)//.com' }} cv={hostile} />)

      const hrefs = [...container.querySelectorAll('a')].map(a => a.getAttribute('href') || '')
      expect(hrefs.some(href => /^javascript:/i.test(href))).toBe(false)
      // El texto sí se muestra, solo que sin ser un enlace.
      expect(screen.getAllByText('javascript:alert(1)//.com').length).toBeGreaterThan(0)
    })
  })
})
