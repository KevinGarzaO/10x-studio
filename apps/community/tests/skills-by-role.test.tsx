import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { SkillsInput } from '@/components/profile-form-fields'
import { resetSkillCatalogCache, skillsForRole, hasRoleData } from '@/lib/skill-catalog'

const CATALOG = {
  skills: [
    { name: 'react', label: 'React', roleCategories: ['frontend', 'fullstack'] },
    { name: 'nodejs', label: 'Node.js', roleCategories: ['backend', 'fullstack'] },
    { name: 'docker', label: 'Docker', roleCategories: ['backend', 'devops'] },
    { name: 'figma', label: 'Figma', roleCategories: ['ux_ui'] },
    { name: 'contabilidad', label: 'Contabilidad', roleCategories: ['otro'] },
    { name: 'sin-rol', label: 'Sin Rol', roleCategories: [] },
  ],
  aliases: [],
}

const NO_ROLE_DATA = {
  skills: CATALOG.skills.map(({ name, label }) => ({ name, label })),
  aliases: [],
}

function mockCatalog(body: unknown = CATALOG) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch
}

function Harness({ roleCategory }: { roleCategory?: string | null }) {
  const [skills, setSkills] = useState<string[]>([])
  const [input, setInput] = useState('')
  return (
    <SkillsInput skills={skills} onChange={setSkills} inputValue={input} onInputChange={setInput} roleCategory={roleCategory} />
  )
}

async function openList() {
  const input = await screen.findByPlaceholderText(/escribe y elige/i)
  fireEvent.focus(input)
  return input
}

const listed = () => screen.queryAllByRole('button').filter(b => b.className === 'skills-suggestion').map(b => b.textContent)

beforeEach(() => {
  resetSkillCatalogCache()
  mockCatalog()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('catalog helpers', () => {
  it('narrows the catalog to the chosen role', () => {
    expect(skillsForRole(CATALOG, 'backend').map(s => s.name)).toEqual(['nodejs', 'docker'])
    expect(skillsForRole(CATALOG, 'ux_ui').map(s => s.name)).toEqual(['figma'])
  })

  it('offers everything to "otro" and to someone who has not chosen a role', () => {
    expect(skillsForRole(CATALOG, 'otro')).toHaveLength(CATALOG.skills.length)
    expect(skillsForRole(CATALOG, null)).toHaveLength(CATALOG.skills.length)
  })

  it('does not filter when the catalog carries no role data', () => {
    expect(hasRoleData(NO_ROLE_DATA)).toBe(false)
    expect(skillsForRole(NO_ROLE_DATA, 'backend')).toHaveLength(NO_ROLE_DATA.skills.length)
  })
})

describe('SkillsInput by role category', () => {
  it('offers only the skills of the chosen role when the field is focused empty', async () => {
    render(<Harness roleCategory="backend" />)
    await openList()

    expect(await screen.findByRole('button', { name: 'Node.js' })).toBeTruthy()
    expect(listed()).toEqual(['Node.js', 'Docker'])
    expect(screen.queryByRole('button', { name: 'Figma' })).toBeNull()
  })

  it('says which role it is showing and can show everything', async () => {
    render(<Harness roleCategory="backend" />)
    await openList()

    expect(await screen.findByText(/Mostrando skills de/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos los skills' }))

    expect(listed()).toContain('Figma')
    expect(screen.getByRole('button', { name: 'Ver solo los de mi rol' })).toBeTruthy()
  })

  it('still finds a skill outside the role when the person types it', async () => {
    render(<Harness roleCategory="backend" />)
    const input = await openList()

    fireEvent.change(input, { target: { value: 'fig' } })

    expect(await screen.findByRole('button', { name: 'Figma' })).toBeTruthy()
  })

  it('puts the skills of the role first when searching', async () => {
    render(<Harness roleCategory="backend" />)
    const input = await openList()

    // "c" aparece en React, Docker y Contabilidad. React va antes en el catálogo,
    // pero Docker es de backend y debe salir primero.
    fireEvent.change(input, { target: { value: 'c' } })
    await screen.findByRole('button', { name: 'Docker' })

    const names = listed()
    expect(names.indexOf('Docker')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('Docker')).toBeLessThan(names.indexOf('React'))
    expect(names.indexOf('Docker')).toBeLessThan(names.indexOf('Contabilidad'))
  })

  it('shows the whole catalog to "otro"', async () => {
    render(<Harness roleCategory="otro" />)
    await openList()

    await screen.findByRole('button', { name: 'Contabilidad' })
    expect(listed()).toEqual(expect.arrayContaining(['React', 'Figma', 'Contabilidad', 'Sin Rol']))
    expect(screen.queryByText(/Mostrando skills de/)).toBeNull()
  })

  it('asks for a role first when none is chosen, and shows everything meanwhile', async () => {
    render(<Harness roleCategory={null} />)
    await openList()

    expect(await screen.findByText(/Elige tu categoría de rol/)).toBeTruthy()
    expect(listed()).toEqual(expect.arrayContaining(['React', 'Figma']))
  })

  it('behaves as before when the field is not tied to any role', async () => {
    render(<Harness />)
    await openList()

    await screen.findByRole('button', { name: 'React' })
    expect(screen.queryByText(/Elige tu categoría de rol/)).toBeNull()
    expect(screen.queryByText(/Mostrando skills de/)).toBeNull()
  })

  it('does not filter when the catalog has no role data yet', async () => {
    mockCatalog(NO_ROLE_DATA)
    render(<Harness roleCategory="backend" />)
    await openList()

    await screen.findByRole('button', { name: 'Figma' })
    expect(screen.queryByText(/Mostrando skills de/)).toBeNull()
  })
})
