import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { FlagsLoader } from '../components/flags-loader'
import { useFlag, loadFlags, setFlagsForTest } from '../lib/flags'

function Probe() {
  return <p>{useFlag('nueva') ? 'con nueva' : 'sin nueva'}</p>
}

describe('flags', () => {
  beforeEach(() => setFlagsForTest({}))
  afterEach(() => { vi.restoreAllMocks() })

  it('everything is off until the server answers, and a failed call keeps it off', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    render(<Probe />)
    await act(async () => { await loadFlags() })
    expect(screen.getByText('sin nueva')).toBeTruthy()
  })

  it('shows what the server turned on and reloads when the session changes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ flags: { nueva: true } })))
    render(<><FlagsLoader /><Probe /></>)
    await act(async () => { await Promise.resolve() })
    expect(await screen.findByText('con nueva')).toBeTruthy()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ flags: {} })))
    await act(async () => { window.dispatchEvent(new Event('avo:session-changed')) })
    expect(await screen.findByText('sin nueva')).toBeTruthy()
  })
})
