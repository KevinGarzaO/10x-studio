import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PublishForm } from '@/components/publish-form'
import { LeftSidebar, PostCard } from '@/components/community-hub'
import { ShellContext } from '@/lib/shell-context'
import { resetSkillCatalogCache } from '@/lib/skill-catalog'

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
const catalog = {
  skills: [
    { name: 'react', label: 'React' }, { name: 'python', label: 'Python' }, { name: 'qa', label: 'QA y Testing' },
    { name: 'testing', label: 'Testing' }, { name: 'aws', label: 'AWS' }, { name: 'sql', label: 'SQL' }, { name: 'docker', label: 'Docker' },
  ],
  aliases: [],
}

function stubFetch(responder: (url: string, init?: RequestInit) => { ok: boolean; status?: number; body: unknown }) {
  calls = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    // El catálogo de skills lo pide el selector de etiquetas; no cuenta como llamada de la prueba.
    if (String(url).includes('/api/community/skills')) return { ok: true, status: 200, json: async () => catalog }
    calls.push({ url: String(url), init })
    const result = responder(String(url), init)
    return { ok: result.ok, status: result.status ?? (result.ok ? 200 : 400), json: async () => result.body }
  }) as unknown as typeof fetch
}

beforeEach(() => {
  push.mockClear()
  resetSkillCatalogCache()
  stubFetch(() => ({ ok: true, body: { post: { id: 'p-new' } } }))
})

const fill = async (title = goodTitle, content = goodContent) => {
  await userEvent.type(screen.getByLabelText('Título'), title)
  fireEvent.change(screen.getByLabelText('Contenido'), { target: { value: content } })
}

describe('PublishForm', () => {
  beforeEach(() => { localStorage.clear() })

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
    expect(screen.getByText(/Título 5\/140 · mínimo 8/)).toBeInTheDocument()
  })

  it('only offers what is built: a cover upload, the toolbar, publish and save draft', () => {
    render(<PublishForm />)

    expect(screen.getByRole('button', { name: 'Subir imagen de portada' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Formato' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeInTheDocument()

    // Lo que no existe todavía no se muestra.
    expect(screen.queryByText(/generar imagen/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/video/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/opciones avanzadas|advanced/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bIA\b|inteligencia artificial/)).not.toBeInTheDocument()
    expect(screen.queryByText(/proyecto/i)).not.toBeInTheDocument()
  })

  it('shows the puestos and skills that match while you type', async () => {
    render(<PublishForm />)
    await userEvent.type(screen.getByLabelText('Etiquetas'), 're')

    expect(await screen.findByRole('option', { name: 'React' })).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('also offers puestos, grouped before the skills', async () => {
    render(<PublishForm />)
    await userEvent.type(screen.getByLabelText('Etiquetas'), 'back')

    expect(await screen.findByRole('option', { name: /backend/i })).toBeInTheDocument()
    expect(screen.getByText('Puestos')).toBeInTheDocument()
  })

  it('picks from the list with a click, and shows the readable name', async () => {
    render(<PublishForm />)
    await userEvent.type(screen.getByLabelText('Etiquetas'), 'pyth')
    await userEvent.click(await screen.findByRole('option', { name: 'Python' }))

    expect(screen.getByText('#Python')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('picks the highlighted one with Enter, and moves with the arrows', async () => {
    render(<PublishForm />)
    const input = screen.getByLabelText('Etiquetas')
    await userEvent.type(input, 'test')
    await screen.findByRole('option', { name: 'Testing' })

    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByText(/^#/)).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('is closed to the list: text that is not a puesto or a skill cannot be added', async () => {
    render(<PublishForm />)
    const input = screen.getByLabelText('Etiquetas')
    await userEvent.type(input, 'mi etiqueta inventada{Enter}')

    expect(screen.getByText(/sin coincidencias/i)).toBeInTheDocument()
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument()
    fireEvent.blur(input)
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument()
  })

  it('does not offer what is already chosen, and stops at five', async () => {
    render(<PublishForm />)
    const input = () => screen.getByLabelText('Etiquetas')

    for (const [typed, name] of [['react', 'React'], ['python', 'Python'], ['aws', 'AWS'], ['sql', 'SQL'], ['docker', 'Docker']]) {
      await userEvent.type(input(), typed)
      await userEvent.click(await screen.findByRole('option', { name }))
    }

    expect(screen.getAllByText(/^#/)).toHaveLength(5)
    expect(screen.queryByLabelText('Etiquetas')).not.toBeInTheDocument()
  })

  it('removes a chosen tag', async () => {
    render(<PublishForm />)
    await userEvent.type(screen.getByLabelText('Etiquetas'), 'react')
    await userEvent.click(await screen.findByRole('option', { name: 'React' }))

    await userEvent.click(screen.getByRole('button', { name: 'Quitar React' }))
    expect(screen.queryByText('#React')).not.toBeInTheDocument()
  })

  it('sends the post with the session and goes to it', async () => {
    render(<PublishForm />)
    await fill()
    await userEvent.type(screen.getByLabelText('Etiquetas'), 'react')
    await userEvent.click(await screen.findByRole('option', { name: 'React' }))
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/post/p-new'))
    const call = calls.find(item => item.url.endsWith('/api/community/posts'))!
    expect(call.init?.method).toBe('POST')
    expect((call.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const body = JSON.parse(String(call.init?.body))
    expect(body).toMatchObject({ type: 'discussion', title: goodTitle, tags: ['react'] })
    expect(body).not.toHaveProperty('imageUrl')
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

    expect(document.querySelector('.editor-preview strong')?.textContent).toBe('mundo')
    expect(document.querySelector('.editor-preview script')).toBeNull()
  })
})

describe('the cover image', () => {
  beforeEach(() => { localStorage.clear() })

  const pick = (label: string, file: File) => fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
  const png = () => new File([new Uint8Array(20)], 'portada.png', { type: 'image/png' })

  it('is uploaded to our server and sent with the post', async () => {
    stubFetch(url => (url.endsWith('/upload-image') ? { ok: true, status: 201, body: { url: 'https://cdn.test/community/u1-1.png' } } : { ok: true, body: { post: { id: 'p-new' } } }))
    render(<PublishForm />)

    pick('Elegir imagen de portada', png())
    expect(await screen.findByAltText('Portada de la publicación')).toHaveAttribute('src', 'https://cdn.test/community/u1-1.png')
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeInTheDocument()

    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(push).toHaveBeenCalled())
    const body = JSON.parse(String(calls.find(item => item.url.endsWith('/api/community/posts'))!.init?.body))
    expect(body.imageUrl).toBe('https://cdn.test/community/u1-1.png')
  })

  it('can be removed', async () => {
    stubFetch(() => ({ ok: true, status: 201, body: { url: 'https://cdn.test/community/u1-1.png' } }))
    render(<PublishForm />)
    pick('Elegir imagen de portada', png())
    await screen.findByAltText('Portada de la publicación')

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))
    expect(screen.queryByAltText('Portada de la publicación')).not.toBeInTheDocument()
  })

  it('refuses a file that is not an image, without calling the server', async () => {
    render(<PublishForm />)
    pick('Elegir imagen de portada', new File(['x'], 'doc.pdf', { type: 'application/pdf' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG, JPG, WEBP o GIF/)
    expect(calls).toHaveLength(0)
  })

  it('shows the reason when the server rejects the image', async () => {
    stubFetch(() => ({ ok: false, status: 400, body: { message: 'La imagen pesa más de 5 MB.' } }))
    render(<PublishForm />)
    pick('Elegir imagen de portada', png())

    expect(await screen.findByRole('alert')).toHaveTextContent('La imagen pesa más de 5 MB.')
  })
})

describe('the toolbar', () => {
  beforeEach(() => { localStorage.clear() })

  it('wraps the selected text in bold', async () => {
    render(<PublishForm />)
    const body = screen.getByLabelText('Contenido') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'hola mundo' } })
    body.setSelectionRange(5, 10)

    await userEvent.click(screen.getByRole('button', { name: 'Negritas' }))

    expect(body.value).toBe('hola **mundo**')
  })

  it('turns lines into a list', async () => {
    render(<PublishForm />)
    const body = screen.getByLabelText('Contenido') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'uno\ndos' } })
    body.setSelectionRange(0, 7)

    await userEvent.click(screen.getByRole('button', { name: 'Lista con viñetas' }))

    expect(body.value).toBe('- uno\n- dos')
  })

  it('keeps the selection on the formatted text and the scroll where it was (it used to jump to the end)', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<PublishForm />)
    const body = screen.getByLabelText('Contenido') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'hola mundo' } })
    body.scrollTop = 120
    body.setSelectionRange(5, 10)

    await userEvent.click(screen.getByRole('button', { name: 'Negritas' }))

    expect(body.selectionStart).toBe(7)
    expect(body.selectionEnd).toBe(12)
    expect(body.scrollTop).toBe(120)
    expect(scrollTo).toHaveBeenCalledWith(0, expect.any(Number))
    scrollTo.mockRestore()
  })

  it('does not take the focus away from the text when a toolbar button is pressed', () => {
    render(<PublishForm />)
    // preventDefault en mousedown: el textarea conserva el foco y el navegador no mueve el scroll.
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Negritas' }))).toBe(false)
  })
})

describe('the draft', () => {
  beforeEach(() => { localStorage.clear() })

  it('is kept in this browser while writing and comes back', async () => {
    const first = render(<PublishForm />)
    await fill()
    await waitFor(() => expect(localStorage.getItem('avo_post_draft')).toContain(goodTitle), { timeout: 2000 })
    first.unmount()

    render(<PublishForm />)
    expect((screen.getByLabelText('Título') as HTMLTextAreaElement).value).toBe(goodTitle)
    expect(screen.getByText('Recuperamos tu borrador')).toBeInTheDocument()
  })

  it('"Guardar borrador" saves it at once and says so', async () => {
    render(<PublishForm />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Borrador guardado')
    expect(localStorage.getItem('avo_post_draft')).toContain(goodTitle)
  })

  it('is cleared once the post is published', async () => {
    render(<PublishForm />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    await waitFor(() => expect(push).toHaveBeenCalled())
    expect(localStorage.getItem('avo_post_draft')).toBeNull()
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
