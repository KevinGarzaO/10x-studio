import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeftSidebar } from '@/components/community-hub'
import { tagHue, tagHref, TAG_HUES } from '@/lib/tag-colors'

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

beforeEach(() => {
  pathname = '/'
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ tags }) })) as unknown as typeof fetch
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
    const { container } = render(<LeftSidebar onPublish={vi.fn()} activeTag={null} onTagClick={vi.fn()} />)

    await waitFor(() => expect(container.querySelector('a[href="/empleos/ia"]')).toBeTruthy())
    expect(container.querySelector('a[href="/empleos/python"]')).toBeTruthy()
  })

  it('show the readable name of the skill', async () => {
    render(<LeftSidebar onPublish={vi.fn()} activeTag={null} onTagClick={vi.fn()} />)
    expect(await screen.findByText('IA / Machine Learning')).toBeTruthy()
  })

  it('each carries its color', async () => {
    const { container } = render(<LeftSidebar onPublish={vi.fn()} activeTag={null} onTagClick={vi.fn()} />)
    await screen.findByText('IA / Machine Learning')

    const python = container.querySelector('a[href="/empleos/python"]')!
    expect(python.className).toContain(`tag-hue-${tagHue('python')}`)
  })

  it('mark the page you are on', async () => {
    pathname = '/empleos/python'
    const { container } = render(<LeftSidebar onPublish={vi.fn()} activeTag={null} onTagClick={vi.fn()} />)
    await screen.findByText('IA / Machine Learning')

    expect(container.querySelector('a[href="/empleos/python"]')!.getAttribute('aria-current')).toBe('page')
    expect(container.querySelector('a[href="/empleos/ia"]')!.getAttribute('aria-current')).toBeNull()
  })

  it('keep filtering the feed when the topic is not a skill', async () => {
    const onTagClick = vi.fn()
    render(<LeftSidebar onPublish={vi.fn()} activeTag={null} onTagClick={onTagClick} />)

    fireEvent.click(await screen.findByRole('button', { name: /tema-libre/ }))

    expect(onTagClick).toHaveBeenCalledWith('tema-libre')
  })

  it('still show links while the topics load, and if the backend does not answer', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const { container } = render(<LeftSidebar onPublish={vi.fn()} activeTag={null} onTagClick={vi.fn()} />)

    expect(container.querySelector('a[href="/empleos/python"]')).toBeTruthy()
  })
})
