import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const storage = vi.hoisted(() => ({ uploads: [] as { path: string; type: string; size: number }[], failUpload: false }))

vi.mock('../../services/supabase.service', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string, buffer: Buffer, options: { contentType: string }) => {
          if (storage.failUpload) return { error: { message: 'boom' } }
          storage.uploads.push({ path, type: options.contentType, size: buffer.length })
          return { error: null }
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/avatars/${path}` } }),
      }),
    },
  },
}))

import { isProviderPhoto, mirrorProviderPhoto } from '../../services/avatar'

const LINKEDIN = 'https://media.licdn.com/dms/image/v2/abc/profile-displayphoto-shrink_200_200/0/1?e=1762300800&v=beta&t=xyz'

const image = (type = 'image/jpeg', bytes = 2048, ok = true) => ({
  ok,
  headers: { get: () => type },
  arrayBuffer: async () => new ArrayBuffer(bytes),
})

const realFetch = global.fetch
beforeEach(() => { storage.uploads.length = 0; storage.failUpload = false })
afterEach(() => { global.fetch = realFetch })

describe('isProviderPhoto', () => {
  it('recognizes the photos of social networks, which expire', () => {
    expect(isProviderPhoto(LINKEDIN)).toBe(true)
    expect(isProviderPhoto('https://avatars.githubusercontent.com/u/1?v=4')).toBe(true)
    expect(isProviderPhoto('https://lh3.googleusercontent.com/a/abc')).toBe(true)
  })

  it('does not touch a photo already stored with us, or anything else', () => {
    expect(isProviderPhoto('https://project.supabase.co/storage/v1/object/public/avatars/u-1.jpg')).toBe(false)
    expect(isProviderPhoto('https://evil.example.com/x.jpg')).toBe(false)
    expect(isProviderPhoto('https://licdn.com.evil.example.com/x.jpg')).toBe(false)
    expect(isProviderPhoto('http://media.licdn.com/x.jpg')).toBe(false)
    expect(isProviderPhoto(null)).toBe(false)
    expect(isProviderPhoto('not a url')).toBe(false)
  })
})

describe('mirrorProviderPhoto', () => {
  it('copies the photo to our storage and returns our own link', async () => {
    global.fetch = vi.fn(async () => image()) as unknown as typeof fetch

    const url = await mirrorProviderPhoto(LINKEDIN, 'user-1')

    expect(url).toMatch(/^https:\/\/project\.supabase\.co\/.*\/avatars\/user-1-\d+\.jpg$/)
    expect(storage.uploads).toEqual([expect.objectContaining({ type: 'image/jpeg', size: 2048 })])
  })

  it('never asks for an address that is not from a social network', async () => {
    global.fetch = vi.fn(async () => image()) as unknown as typeof fetch

    expect(await mirrorProviderPhoto('http://169.254.169.254/latest/meta-data', 'user-1')).toBeNull()
    expect(await mirrorProviderPhoto('https://evil.example.com/x.jpg', 'user-1')).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('gives up without breaking when the link already expired', async () => {
    global.fetch = vi.fn(async () => image('image/jpeg', 10, false)) as unknown as typeof fetch
    expect(await mirrorProviderPhoto(LINKEDIN, 'user-1')).toBeNull()
    expect(storage.uploads).toHaveLength(0)
  })

  it('rejects what is not an image, or is too big, or is empty', async () => {
    global.fetch = vi.fn(async () => image('text/html')) as unknown as typeof fetch
    expect(await mirrorProviderPhoto(LINKEDIN, 'user-1')).toBeNull()

    global.fetch = vi.fn(async () => image('image/jpeg', 6 * 1024 * 1024)) as unknown as typeof fetch
    expect(await mirrorProviderPhoto(LINKEDIN, 'user-1')).toBeNull()

    global.fetch = vi.fn(async () => image('image/jpeg', 0)) as unknown as typeof fetch
    expect(await mirrorProviderPhoto(LINKEDIN, 'user-1')).toBeNull()
  })

  it('returns null if the network fails or the upload fails, so the caller keeps the original', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await mirrorProviderPhoto(LINKEDIN, 'user-1')).toBeNull()

    global.fetch = vi.fn(async () => image()) as unknown as typeof fetch
    storage.failUpload = true
    expect(await mirrorProviderPhoto(LINKEDIN, 'user-1')).toBeNull()
  })
})
