import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Response } from 'express'
import type { AuthRequest } from '../../middleware/community-auth.middleware'
import { requireAccountType } from '../../src/middleware/require-account-type.middleware'

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

function mockRes() {
  const res = {} as Response
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('requireAccountType (T011)', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
  })

  it('responds 401 when there is no authenticated user', async () => {
    const res = mockRes()
    const next = vi.fn()

    await requireAccountType('candidate')({} as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 candidates_only for a company account', async () => {
    maybeSingle.mockResolvedValue({ data: { account_type: 'company' }, error: null })
    const res = mockRes()
    const next = vi.fn()

    await requireAccountType('candidate')({ userId: 'company-1' } as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'candidates_only' }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 when the account does not exist or the lookup fails', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = mockRes()
    const next = vi.fn()

    await requireAccountType('candidate')({ userId: 'ghost' } as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next for the matching account type', async () => {
    maybeSingle.mockResolvedValue({ data: { account_type: 'candidate' }, error: null })
    const res = mockRes()
    const next = vi.fn()

    await requireAccountType('candidate')({ userId: 'candidate-1' } as AuthRequest, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('gates the company side with companies_only', async () => {
    maybeSingle.mockResolvedValue({ data: { account_type: 'candidate' }, error: null })
    const res = mockRes()
    const next = vi.fn()

    await requireAccountType('company')({ userId: 'candidate-1' } as AuthRequest, res, next)

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'companies_only' }))
    expect(next).not.toHaveBeenCalled()
  })
})
