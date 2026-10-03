import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompanyClaimForm } from '@/components/company-claim-form'
import type { CompanyClaim } from '@/lib/company-claim'

const submitCompanyClaim = vi.fn(async (_payload: Record<string, unknown>) => ({
  ok: true as const,
  claim: {} as CompanyClaim,
}))
const searchClaimableCompanies = vi.fn(async (_q: string) => [
  { id: '11111111-1111-4111-8111-111111111111', slug: 'acme', name: 'Acme SA de CV', logoUrl: null },
])

vi.mock('@/lib/company-claim', async () => {
  const actual = await vi.importActual<typeof import('@/lib/company-claim')>('@/lib/company-claim')
  return {
    ...actual,
    submitCompanyClaim: (payload: unknown) => submitCompanyClaim(payload as Record<string, unknown>),
    searchClaimableCompanies: (q: string) => searchClaimableCompanies(q),
    readFileAsDataUrl: async () => 'data:application/pdf;base64,AAA',
  }
})

function pdf(name: string) {
  return new File(['x'], name, { type: 'application/pdf' })
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nombre de la empresa'), 'Acme SA de CV')
  await user.type(screen.getByLabelText('RFC'), 'acm010203xy1')
  await user.upload(screen.getByLabelText(/Acta constitutiva/), pdf('acta.pdf'))
  await user.upload(screen.getByLabelText(/identificación oficial/), pdf('ine.pdf'))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CompanyClaimForm', () => {
  it('envía el reclamo con el RFC en mayúsculas y los dos documentos', async () => {
    const user = userEvent.setup()
    const onSubmitted = vi.fn()
    render(<CompanyClaimForm claim={null} onSubmitted={onSubmitted} />)

    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    await waitFor(() => expect(submitCompanyClaim).toHaveBeenCalled())
    const payload = submitCompanyClaim.mock.calls[0]![0]
    expect(payload.rfc).toBe('ACM010203XY1')
    expect(payload.companyName).toBe('Acme SA de CV')
    expect((payload.documents as { kind: string }[]).map(d => d.kind).sort()).toEqual(['existence', 'identity'])
    expect(onSubmitted).toHaveBeenCalled()
  })

  it('no envía nada si falta un documento obligatorio', async () => {
    const user = userEvent.setup()
    render(<CompanyClaimForm claim={null} onSubmitted={vi.fn()} />)

    await user.type(screen.getByLabelText('Nombre de la empresa'), 'Acme SA de CV')
    await user.type(screen.getByLabelText('RFC'), 'ACM010203XY1')
    await user.upload(screen.getByLabelText(/Acta constitutiva/), pdf('acta.pdf'))
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Falta un documento/)
    expect(submitCompanyClaim).not.toHaveBeenCalled()
  })

  it('avisa cuando el RFC tiene mal formato, sin llamar al backend', async () => {
    const user = userEvent.setup()
    render(<CompanyClaimForm claim={null} onSubmitted={vi.fn()} />)

    await user.type(screen.getByLabelText('Nombre de la empresa'), 'Acme SA de CV')
    await user.type(screen.getByLabelText('RFC'), 'NOESRFC')
    await user.upload(screen.getByLabelText(/Acta constitutiva/), pdf('acta.pdf'))
    await user.upload(screen.getByLabelText(/identificación oficial/), pdf('ine.pdf'))
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/RFC/)
    expect(submitCompanyClaim).not.toHaveBeenCalled()
  })

  it('ofrece las empresas que ya existen y manda su id al reclamarla', async () => {
    const user = userEvent.setup()
    render(<CompanyClaimForm claim={null} onSubmitted={vi.fn()} />)

    await user.type(screen.getByLabelText('Nombre de la empresa'), 'Acme')
    const match = await screen.findByRole('button', { name: /Acme SA de CV/ }, { timeout: 3000 })
    await user.click(match)
    expect(screen.getByText(/Reclamarás el perfil que ya existe/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('RFC'), 'ACM010203XY1')
    await user.upload(screen.getByLabelText(/Acta constitutiva/), pdf('acta.pdf'))
    await user.upload(screen.getByLabelText(/identificación oficial/), pdf('ine.pdf'))
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    await waitFor(() => expect(submitCompanyClaim).toHaveBeenCalled())
    const payload = submitCompanyClaim.mock.calls[0]![0]
    expect(payload.companyUserId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('con un reclamo pendiente muestra el estado y ningún formulario', () => {
    const claim: CompanyClaim = {
      id: 'c1',
      companyName: 'Acme SA de CV',
      rfc: 'ACM010203XY1',
      companyUserId: null,
      status: 'pending',
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      documents: [{ kind: 'existence', fileName: 'acta.pdf' }],
    }
    render(<CompanyClaimForm claim={claim} onSubmitted={vi.fn()} />)

    expect(screen.getByText(/en revisión/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar solicitud' })).toBeNull()
  })

  it('tras un rechazo muestra el motivo y deja volver a enviar', () => {
    const claim: CompanyClaim = {
      id: 'c2',
      companyName: 'Acme SA de CV',
      rfc: 'ACM010203XY1',
      companyUserId: null,
      status: 'rejected',
      rejectionReason: 'El acta no corresponde a la empresa',
      createdAt: new Date().toISOString(),
      documents: [],
    }
    render(<CompanyClaimForm claim={claim} onSubmitted={vi.fn()} />)

    expect(screen.getByText('El acta no corresponde a la empresa')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar solicitud' })).toBeInTheDocument()
  })

  it('nunca muestra un enlace a los documentos entregados', () => {
    const claim: CompanyClaim = {
      id: 'c3',
      companyName: 'Acme SA de CV',
      rfc: 'ACM010203XY1',
      companyUserId: null,
      status: 'pending',
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      documents: [{ kind: 'existence', fileName: 'acta.pdf' }, { kind: 'identity', fileName: 'ine.pdf' }],
    }
    const { container } = render(<CompanyClaimForm claim={claim} onSubmitted={vi.fn()} />)

    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(screen.getByText(/2 documentos entregados/)).toBeInTheDocument()
  })
})
