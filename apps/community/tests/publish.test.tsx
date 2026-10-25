import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublishForm } from '@/components/publish-form'
import { LeftSidebar, PostCard } from '@/components/community-hub'
import { ShellContext } from '@/lib/shell-context'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  usePathname: () => '/publicar',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/session', () => ({ getToken: () => 'tok', getCachedUser: () => null, clearSession: vi.fn() }))

const goodTitle = '¿Cómo estructuran sus pruebas?'
const goodContent = 'Estoy armando la estrategia de pruebas de un equipo nuevo y quiero saber cómo lo hacen ustedes.'

let calls: { url: string; init?: RequestInit }[] = []
function stubFetch(responder: (url: string, init?: RequestInit) => { ok: boolean; status?: number; body: unknown }) {
  calls = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const result = responder(String(url), init)
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 400), json: async () => result.body }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  push.mockClear()
  stubFetch(() => ({ ok: true, body: { post: { id: 'p-new' } } }))
})

const fill = async (title = goodTitle, content = goodContent) => {
  await userEvent.type(screen.getByLabelText('Título'), title)
  fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: content } })
}

describe('PublishForm', () => {
  it('cannot publish until the title and the content are long enough', async () => {
    render(<PublishForm />)
    const button = screen.getByRole('button', { name: 'Publicar' })
    expect(button).toBeDisabled()

    await fill('corto', 'poco')
    expect(button).toBeDisabled()

    await userEvent.clear(screen.getByLabelText('Título'))
    await fill(goodTitle, goodContent)
    expect(button).toBeEnabled()
  })

  it('shows how much is left to write', async () => {
    render(<PublishForm />)
    await userEvent.type(screen.getByLabelText('Título'), 'corto')
    expect(screen.getByText(/5 \/ 140 · mínimo 8/)).toBeInTheDocument()
  })

  it('only offers discussions for now: no project option', () => {
    render(<PublishForm />)

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText(/proyecto/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nueva discusión' })).toBeInTheDocument()
  })

  it('adds tags with Enter, cleans them, ignores repeats and stops at five', async () => {
    render(<PublishForm />)
    const input = screen.getByLabelText(/etiquetas/i)

    for (const raw of ['React', 'Node JS!', 'react', 'qa', 'testing', 'carrera', 'sexta']) {
      await userEvent.type(input, `${raw}{Enter}`)
    }

    expect(screen.getByText('#react')).toBeInTheDocument()
    expect(screen.getByText('#node-js')).toBeInTheDocument()
    expect(screen.getAllByText(/^#react$/)).toHaveLength(1)
    expect(screen.queryByText('#sexta')).not.toBeInTheDocument()
  })

  it('sends the post with the session and goes to it', async () => {
    render(<PublishForm />)
    await fill()
    await userEvent.type(screen.getByLabelText(/etiquetas/i), 'qa{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/post/p-new'))
    const call = calls.find(item => item.url.endsWith('/api/community/posts'))!
    expect(call.init?.method).toBe('POST')
    expect((call.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(call.init?.body))).toMatchObject({ type: 'discussion', title: goodTitle, tags: ['qa'] })
  })

  it('shows the reason when the server refuses, and stays on the form', async () => {
    stubFetch(() => ({ ok: false, status: 403, body: { error: 'profile_incomplete', message: 'Completa tu perfil para poder publicar.' } }))
    render(<PublishForm />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Completa tu perfil para poder publicar.')
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled()
  })

  it('previews the text, and a script in it is only text', async () => {
    render(<PublishForm />)
    fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: 'Hola **mundo** <script>alert(1)</script>' } })
    await userEvent.click(screen.getByRole('tab', { name: 'Vista previa' }))

    expect(document.querySelector('.publish-preview strong')?.textContent).toBe('mundo')
    expect(document.querySelector('.publish-preview script')).toBeNull()
  })
})

describe('the way into publishing', () => {
  it('is in the side menu', () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch
    const { container } = render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)
    expect(container.querySelector('a[href="/publicar"]')?.textContent).toContain('Publicar')
  })
})

describe('voting on a member post', () => {
  const discussion = {
    id: 'd1', type: 'discussion', title: 'Una discusión', content: 'texto', tags: ['qa'], votesCount: 3, commentsCount: 0,
    created_at: '2026-10-20T00:00:00Z', author: { id: 'a', username: 'ana', display_name: 'Ana', photo_url: null },
  } as any

  const shell = (user: unknown, requestAuth = vi.fn()) => ({ user, userLoaded: true, requestAuth, search: '', activeTag: null, setActiveTag: vi.fn() })

  it('is stored on the server and moves the number', async () => {
    const { container } = render(<ShellContext.Provider value={shell({ id: 'u1' })}><PostCard post={discussion} /></ShellContext.Provider>)

    fireEvent.click(container.querySelector('.vote-button')!)

    await waitFor(() => expect(calls.some(call => call.url.endsWith('/posts/d1/vote') && call.init?.method === 'POST')).toBe(true))
    expect(container.querySelector('.vote-button')?.textContent).toContain('4')
  })

  it('undoes the number if the server says no', async () => {
    stubFetch(() => ({ ok: false, status: 500, body: {} }))
    const { container } = render(<ShellContext.Provider value={shell({ id: 'u1' })}><PostCard post={discussion} /></ShellContext.Provider>)

    fireEvent.click(container.querySelector('.vote-button')!)

    await waitFor(() => expect(container.querySelector('.vote-button')?.textContent).toContain('3'))
  })

  it('shows a vote the person already gave, without counting it twice', () => {
    const { container } = render(<ShellContext.Provider value={shell({ id: 'u1' })}><PostCard post={{ ...discussion, votesCount: 3, hasVoted: true }} /></ShellContext.Provider>)

    expect(container.querySelector('.vote-button.voted')).toBeTruthy()
    expect(container.querySelector('.vote-button')?.textContent).toContain('3')
  })

  it('asks a visitor to sign up instead of voting', () => {
    const onAuthRequired = vi.fn()
    const { container } = render(<ShellContext.Provider value={shell(null)}><PostCard post={discussion} onAuthRequired={onAuthRequired} /></ShellContext.Provider>)

    fireEvent.click(container.querySelector('.vote-button')!)

    expect(onAuthRequired).toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('does not call the server for the editorial articles of the team', () => {
    const article = { ...discussion, id: 'e1', type: 'editorial' }
    const { container } = render(<ShellContext.Provider value={shell({ id: 'u1' })}><PostCard post={article} /></ShellContext.Provider>)

    fireEvent.click(container.querySelector('.vote-button')!)
    expect(calls).toHaveLength(0)
  })
})
