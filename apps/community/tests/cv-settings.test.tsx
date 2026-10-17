import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CvSettings } from '@/components/cv/CvSettings'

vi.mock('@/lib/session', () => ({ getToken: () => 'tok' }))

const profile = {
  displayName: 'Ana Pérez',
  headline: 'Desarrollo Backend · Senior',
  location: 'Monterrey, MX',
  workModality: 'Remoto',
  skills: ['Node.js'],
}

const props = { username: 'ana', initialCv: {}, initialPublic: false, profile }

let putResponse: { ok: boolean; body: unknown }

beforeEach(() => {
  putResponse = { ok: true, body: {} }
  global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const sent = init?.body ? JSON.parse(String(init.body)) : {}
    return {
      ok: putResponse.ok,
      json: async () => (putResponse.ok ? { cv: sent.cv, isPublic: sent.public } : putResponse.body),
    }
  }) as unknown as typeof fetch
})

const putCalls = () => (global.fetch as any).mock.calls.filter((c: any[]) => c[1]?.method === 'PUT')

describe('CvSettings form', () => {
  it('starts with nothing to save', () => {
    render(<CvSettings view="form" {...props} />)

    expect((screen.getByRole('button', { name: /Guardar CV/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText(/cambios sin guardar/)).toBeNull()
  })

  it('notices a change and offers to save it', () => {
    render(<CvSettings view="form" {...props} />)

    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Hola' } })

    expect((screen.getByRole('button', { name: /Guardar CV/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText(/Tienes cambios sin guardar/)).toBeTruthy()
  })

  it('saves the CV with the session token, to the right place, private by default', async () => {
    render(<CvSettings view="form" {...props} />)
    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Hola' } })

    fireEvent.click(screen.getByRole('button', { name: /Guardar CV/ }))

    await waitFor(() => expect(screen.getByRole('button', { name: /CV guardado/ })).toBeTruthy())
    const [url, init] = putCalls()[0]
    expect(String(url)).toMatch(/\/api\/community\/users\/ana\/cv$/)
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toMatchObject({ cv: { summary: 'Hola' }, public: false })
    expect(screen.queryByText(/cambios sin guardar/)).toBeNull()
  })

  it('does not call the server when the CV is wrong, and says which entry to fix', () => {
    render(<CvSettings view="form" {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Agregar experiencia/ }))
    fireEvent.change(screen.getByLabelText('Puesto (experiencia 1)'), { target: { value: 'Dev' } })

    fireEvent.click(screen.getByRole('button', { name: /Guardar CV/ }))

    expect(screen.getByRole('alert').textContent).toBe('Experiencia 1: Falta la empresa')
    expect(putCalls()).toHaveLength(0)
  })

  it('shows what the server answers when it refuses the save, and keeps the changes', async () => {
    putResponse = { ok: false, body: { message: 'No tienes permiso' } }
    render(<CvSettings view="form" {...props} />)
    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Hola' } })

    fireEvent.click(screen.getByRole('button', { name: /Guardar CV/ }))

    expect((await screen.findByRole('alert')).textContent).toBe('No tienes permiso')
    expect((screen.getByLabelText('Resumen profesional') as HTMLTextAreaElement).value).toBe('Hola')
  })

  it('survives a connection failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    render(<CvSettings view="form" {...props} />)
    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Hola' } })

    fireEvent.click(screen.getByRole('button', { name: /Guardar CV/ }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/conexión/i)
  })

  it('loads a CV that was saved before', () => {
    render(<CvSettings view="form" {...props} initialCv={{ summary: 'Ya estaba', languages: [{ name: 'Inglés', level: 'avanzado' }] }} />)

    expect((screen.getByLabelText('Resumen profesional') as HTMLTextAreaElement).value).toBe('Ya estaba')
    expect((screen.getByLabelText('Idioma (idioma 1)') as HTMLInputElement).value).toBe('Inglés')
  })

  it('does not break on a stored CV that is damaged', () => {
    render(<CvSettings view="form" {...props} initialCv={'basura'} />)

    expect((screen.getByLabelText('Resumen profesional') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('CvSettings privacy', () => {
  it('keeps the CV private until its owner chooses otherwise', () => {
    render(<CvSettings view="form" {...props} />)

    expect((screen.getByLabelText('Hacer público mi CV') as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByText(/Tu enlace/)).toBeNull()
  })

  it('sends the public choice and then shows the link', async () => {
    render(<CvSettings view="form" {...props} />)

    fireEvent.click(screen.getByLabelText('Hacer público mi CV'))
    // Mientras no se guarde, el enlace todavía no existe.
    expect(screen.getByText(/Guarda los cambios para activar el enlace/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Guardar CV/ }))

    await waitFor(() => expect(screen.getByText(/Tu enlace/)).toBeTruthy())
    expect(JSON.parse(putCalls()[0][1].body).public).toBe(true)
    expect(screen.getByRole('link', { name: '/cv/ana' }).getAttribute('href')).toBe('/cv/ana')
  })

  it('shows the link right away for a CV that was already public', () => {
    render(<CvSettings view="form" {...props} initialPublic />)

    expect(screen.getByRole('link', { name: '/cv/ana' })).toBeTruthy()
  })
})

describe('CvSettings preview', () => {
  it('shows the CV sheet with the profile data and what was typed, saved or not', () => {
    const { rerender } = render(<CvSettings view="form" {...props} />)
    fireEvent.change(screen.getByLabelText('Resumen profesional'), { target: { value: 'Ingeniera backend' } })

    rerender(<CvSettings view="preview" {...props} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Ana Pérez' })).toBeTruthy()
    expect(screen.getByText('Ingeniera backend')).toBeTruthy()
    expect(screen.getByText('Desarrollo Backend · Senior')).toBeTruthy()
    expect(screen.getByText(/Incluye cambios que aún no guardas/)).toBeTruthy()
  })

  it('follows the profile form: the role and the name change the sheet at once', () => {
    const { rerender } = render(<CvSettings view="preview" {...props} />)
    expect(screen.getByText('Desarrollo Backend · Senior')).toBeTruthy()

    rerender(<CvSettings view="preview" {...props} profile={{ ...profile, displayName: 'Ana P.', headline: 'Finanzas y Contabilidad' }} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Ana P.' })).toBeTruthy()
    expect(screen.getByText('Finanzas y Contabilidad')).toBeTruthy()
  })

  it('explains what to do when the CV is empty', () => {
    render(<CvSettings view="preview" {...props} />)

    expect(screen.getByText(/Tu CV está vacío todavía/)).toBeTruthy()
  })

  it('prints through the browser', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<CvSettings view="preview" {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /Imprimir o guardar PDF/ }))

    expect(print).toHaveBeenCalled()
  })

  it('offers the online link only for a CV that is public and saved', () => {
    const { unmount } = render(<CvSettings view="preview" {...props} />)
    expect(screen.queryByRole('link', { name: /Abrir CV en línea/ })).toBeNull()
    unmount()

    render(<CvSettings view="preview" {...props} initialPublic />)
    expect(screen.getByRole('link', { name: /Abrir CV en línea/ })).toBeTruthy()
  })
})
