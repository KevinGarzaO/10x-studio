import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeftSidebar } from '@/components/community-hub'
import { tagHue, tagHref, assignHues, TAG_HUES } from '@/lib/tag-colors'

let pathname = '/'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => pathname,
}))

const tags = [
  { name: 'python', label: 'Python', skill: true, count: 85 },
  { name: 'ia', label: 'IA / Machine Learning', skill: true, count: 56 },
  { name: 'tema-libre', label: 'tema-libre', skill: false, count: 3 },
]

const roles = [
  { role: 'backend', slug: 'backend', label: 'Backend', count: 40 },
  { role: 'ux_ui', slug: 'ux-ui', label: 'UX / UI', count: 12 },
]

beforeEach(() => {
  pathname = '/'
  global.fetch = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes('/stats/roles') ? { roles } : { tags }),
  })) as unknown as typeof fetch
})

describe('tagHue', () => {
  it('gives the same color to the same topic every time, whatever its case', () => {
    expect(tagHue('python')).toBe(tagHue('python'))
    expect(tagHue('Python')).toBe(tagHue('python'))
  })

  it('always picks one of the available colors', () => {
    for (const name of ['python', 'sql', 'aws', 'ia', 'git', 'sales', 'customer-service', '']) {
      const hue = tagHue(name)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(TAG_HUES)
    }
  })

  it('does not paint every topic the same color', () => {
    const hues = new Set(['python', 'sql', 'aws', 'ia', 'git', 'sales', 'react', 'java'].map(tagHue))
    expect(hues.size).toBeGreaterThan(3)
  })
})

describe('assignHues', () => {
  it('never paints two visible topics the same color', () => {
    // "python" y "sales" caen en el mismo color por nombre: es justo lo que se vio en el sitio.
    const names = ['python', 'sales', 'sql', 'aws', 'ia', 'git']
    const hues = assignHues(names)

    expect(new Set(Object.values(hues)).size).toBe(names.length)
  })

  it('is stable: the same list always gets the same colors', () => {
    const names = ['python', 'sales', 'sql', 'aws', 'ia', 'git']
    expect(assignHues(names)).toEqual(assignHues([...names]))
  })

  it('keeps the color of a topic that does not collide', () => {
    expect(assignHues(['python'])['python']).toBe(tagHue('python'))
  })

  it('repeats colors only when there are more topics than colors', () => {
    const many = Array.from({ length: TAG_HUES + 3 }, (_, index) => `tema-${index}`)
    const hues = Object.values(assignHues(many))

    expect(new Set(hues).size).toBe(TAG_HUES)
    expect(hues.every(hue => hue >= 0 && hue < TAG_HUES)).toBe(true)
  })
})

describe('tagHref', () => {
  it('sends a skill to its jobs page', () => {
    expect(tagHref({ name: 'python', label: 'Python', skill: true })).toBe('/empleos/python')
    expect(tagHref({ name: 'customer-service', label: 'x', skill: true })).toBe('/empleos/customer-service')
  })

  it('has no page for a topic that is not a skill', () => {
    expect(tagHref({ name: 'tema-libre', label: 'x', skill: false })).toBeNull()
  })
})

describe('the trending topics in the sidebar', () => {
  it('link to their jobs page, so a click on "python" opens /empleos/python', async () => {
    const { container } = render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)

    await waitFor(() => expect(container.querySelector('a[href="/empleos/ia"]')).toBeTruthy())
    expect(container.querySelector('a[href="/empleos/python"]')).toBeTruthy()
  })

  it('show the readable name of the skill', async () => {
    render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)
    expect(await screen.findByText('IA / Machine Learning')).toBeTruthy()
  })

  it('each carries its own color, none repeated', async () => {
    const { container } = render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)
    await screen.findByText('IA / Machine Learning')

    const colors = [...container.querySelectorAll('.tags-section')[1].querySelectorAll('.tag-link')].map(link => /tag-hue-(\d)/.exec(link.className)![1])
    expect(colors).toHaveLength(3)
    expect(new Set(colors).size).toBe(3)
  })

  it('list the trending roles, each linking to its page with its own color', async () => {
    const { container } = render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)

    await screen.findByText('UX / UI')
    expect(container.querySelector('a[href="/puestos/backend"]')).toBeTruthy()
    expect(container.querySelector('a[href="/puestos/ux-ui"]')).toBeTruthy()

    const colors = [...container.querySelectorAll('.tags-section')[0].querySelectorAll('.tag-link')].map(link => /tag-hue-(\d)/.exec(link.className)![1])
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('mark the page you are on', async () => {
    pathname = '/empleos/python'
    const { container } = render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)
    await screen.findByText('IA / Machine Learning')

    expect(container.querySelector('a[href="/empleos/python"]')!.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('a[href="/empleos/ia"]')!.getAttribute('aria-current')).toBeNull()
  })

  it('keep filtering the feed when the topic is not a skill', async () => {
    const onTagClick = vi.fn()
    render(<LeftSidebar activeTag={null} onTagClick={onTagClick} />)

    fireEvent.click(await screen.findByRole('button', { name: /tema-libre/ }))

    expect(onTagClick).toHaveBeenCalledWith('tema-libre')
  })

  it('offer no way to publish: that feature is not working yet, so the sidebar leaves it out', async () => {
    render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)
    await screen.findByText('IA / Machine Learning')

    expect(screen.queryByText(/crear publicación/i)).toBeNull()
    expect(screen.queryByText(/comparte lo que sabes/i)).toBeNull()
  })

  it('still show links while the topics load, and if the backend does not answer', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const { container } = render(<LeftSidebar activeTag={null} onTagClick={vi.fn()} />)

    expect(container.querySelector('a[href="/empleos/python"]')).toBeTruthy()
  })
})
