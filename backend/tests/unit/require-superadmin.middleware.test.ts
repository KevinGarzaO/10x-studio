import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/community-auth.middleware'
import { requireSuperadmin } from '../../src/middleware/require-superadmin.middleware'

const maybeSingle = vi.fn()

// vi.mock calls are hoisted above imports by vitest's transform, so the
// middleware picks up this mocked client regardless of import order above.
vi.mock('../../services/supabase.service', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
    }),
  },
}))

function mockRes() {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('requireSuperadmin (T011)', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
  })

  it('responds 401 when there is no authenticated user', async () => {
    const res = mockRes()
    const next = vi.fn()

    await requireSuperadmin({} as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 when the account is not a superadmin', async () => {
    maybeSingle.mockResolvedValue({ data: { is_superadmin: false }, error: null })
    const res = mockRes()
    const next = vi.fn()

    await requireSuperadmin({ userId: 'user-1' } as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No tienes permisos para esta acción' }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  // La razón de existir de este middleware: el permiso ya no sale de roles,
  // así que una keyword del scraper no puede otorgarlo (FR-005).
  it('ignores users.roles entirely, even a roles array containing "admin"', async () => {
    maybeSingle.mockResolvedValue({
      data: { is_superadmin: false, roles: ['admin'] },
      error: null,
    })
    const res = mockRes()
    const next = vi.fn()

    await requireSuperadmin({ userId: 'scraped-profile' } as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 when the lookup fails', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = mockRes()
    const next = vi.fn()

    await requireSuperadmin({ userId: 'user-2' } as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next for a superadmin', async () => {
    maybeSingle.mockResolvedValue({ data: { is_superadmin: true }, error: null })
    const res = mockRes()
    const next = vi.fn()

    await requireSuperadmin({ userId: 'user-3' } as AuthRequest, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })
})
