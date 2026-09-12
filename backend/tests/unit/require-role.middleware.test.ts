import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/community-auth.middleware'

const maybeSingle = vi.fn()

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

// Imported after the mock so require-role picks up the mocked client
const { requireRole } = await import('../../src/middleware/require-role.middleware')

function mockRes() {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('requireRole', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
  })

  it('responds 401 when there is no authenticated user', async () => {
    const req = {} as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    await requireRole('admin')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 when the user does not have the required role', async () => {
    maybeSingle.mockResolvedValue({ data: { roles: ['candidate'] }, error: null })
    const req = { userId: 'user-1' } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    await requireRole('admin')(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No tienes permisos para esta acción' }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next when the user has the required role', async () => {
    maybeSingle.mockResolvedValue({ data: { roles: ['admin'] }, error: null })
    const req = { userId: 'user-2' } as AuthRequest
    const res = mockRes()
    const next = vi.fn()

    await requireRole('admin')(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })
})
