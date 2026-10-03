import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { SkillsInput } from '@/components/profile-form-fields'
import { resetSkillCatalogCache } from '@/lib/skill-catalog'

const CATALOG = {
  skills: [
    { name: 'react', label: 'React' },
    { name: 'nodejs', label: 'Node.js' },
    { name: 'python', label: 'Python' },
  ],
  aliases: [{ alias: 'reactjs', skillName: 'react' }],
}

function mockCatalog(response: { ok: boolean; body?: unknown }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    json: async () => response.body ?? CATALOG,
  }) as unknown as typeof fetch
}

/** Envoltura con estado real: así el test ejercita lo que ve la persona. */
function Harness({ initial = [] as string[], onPropose }: { initial?: string[]; onPropose?: (t: string) => void }) {
  const [skills, setSkills] = useState<string[]>(initial)
  const [input, setInput] = useState('')
  return (
    <>
      <SkillsInput
        skills={skills}
        onChange={setSkills}
        inputValue={input}
        onInputChange={setInput}
        onPropose={onPropose}
      />
      <output data-testid="saved">{skills.join(',')}</output>
    </>
  )
}

beforeEach(() => {
  resetSkillCatalogCache()
  mockCatalog({ ok: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SkillsInput (T020)', () => {
  it('suggests skills from the loaded catalog', async () => {
    render(<Harness />)
    const input = await screen.findByPlaceholderText(/escribe y elige/i)

    fireEvent.change(input, { target: { value: 'nod' } })

    expect(await screen.findByRole('button', { name: 'Node.js' })).toBeTruthy()
  })

  it('lists catalog skills as soon as the empty field is focused', async () => {
    render(<Harness initial={['react']} />)
    const input = await screen.findByPlaceholderText(/escribe y elige/i)

    fireEvent.focus(input)

    expect(await screen.findByRole('button', { name: 'Node.js' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Python' })).toBeTruthy()
    // Lo que el perfil ya tiene no se vuelve a ofrecer.
    expect(screen.queryByRole('button', { name: 'React' })).toBeNull()
  })

  it('treats a catalog that answers with zero skills as unavailable', async () => {
    mockCatalog({ ok: true, body: { skills: [], aliases: [] } })
    render(<Harness />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeTruthy()
  })

  // FR-013: la variante conocida se guarda con el nombre canónico.
  it('stores "reactjs" as the canonical react skill', async () => {
    render(<Harness />)
    const input = await screen.findByPlaceholderText(/escribe y elige/i)

    fireEvent.change(input, { target: { value: 'reactjs' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('saved').textContent).toBe('react')
    })
  })

  // FR-012: lo que no está en el catálogo no entra al perfil.
  it('does not add free text that matches no skill', async () => {
    render(<Harness />)
    const input = await screen.findByPlaceholderText(/escribe y elige/i)

    fireEvent.change(input, { target: { value: 'rust' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText(/no está en el catálogo/i)).toBeTruthy()
    })
    expect(screen.getByTestId('saved').textContent).toBe('')
  })

  it('offers to propose the unknown text when proposing is available', async () => {
    const onPropose = vi.fn()
    render(<Harness onPropose={onPropose} />)
    const input = await screen.findByPlaceholderText(/escribe y elige/i)

    fireEvent.change(input, { target: { value: 'rust' } })

    const button = await screen.findByRole('button', { name: /proponer/i })
    fireEvent.click(button)

    expect(onPropose).toHaveBeenCalledWith('rust')
    expect(screen.getByTestId('saved').textContent).toBe('')
  })

  // FR-015: un skill heredado fuera del catálogo se marca para resolverlo.
  it('marks a stored skill that is not in the catalog', async () => {
    render(<Harness initial={['react', 'skill-viejo']} />)

    expect(await screen.findByText(/fuera del catálogo/i)).toBeTruthy()
    expect(screen.getByText('React')).toBeTruthy()
  })

  // Un fallo de red no puede parecer "no hay skills".
  it('shows an error and blocks input when the catalog fails to load', async () => {
    mockCatalog({ ok: false })
    render(<Harness />)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByPlaceholderText(/escribe y elige/i)).toBeNull()
  })
})
