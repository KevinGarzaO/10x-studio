import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useSeenOnce } from '../lib/use-seen'

type Callback = (entries: { isIntersecting: boolean }[]) => void
let callback: Callback | null = null

function Probe({ id, onSeen }: { id: string; onSeen: () => void }) {
  const ref = useSeenOnce(id, onSeen)
  return <button ref={ref}>Postularse</button>
}

afterEach(() => { callback = null; vi.unstubAllGlobals() })

describe('useSeenOnce', () => {
  it('reports once per key, only when the element really enters the screen', () => {
    vi.stubGlobal('IntersectionObserver', class { constructor(cb: Callback) { callback = cb } observe() {} disconnect() {} })
    const onSeen = vi.fn()
    render(<Probe id="a" onSeen={onSeen} />)
    callback?.([{ isIntersecting: false }])
    expect(onSeen).not.toHaveBeenCalled()
    callback?.([{ isIntersecting: true }])
    callback?.([{ isIntersecting: true }])
    expect(onSeen).toHaveBeenCalledTimes(1)
  })

  it('says nothing when the browser cannot observe (better not to measure than to guess)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const onSeen = vi.fn()
    render(<Probe id="b" onSeen={onSeen} />)
    expect(onSeen).not.toHaveBeenCalled()
  })
})
