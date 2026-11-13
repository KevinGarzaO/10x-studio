import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { Readable } from 'stream'

const blobs = new Map<string, { data: Buffer; type: string }>()
const created: string[] = []
vi.mock('@azure/storage-blob', () => {
  const containerClient = (name: string) => ({
    createIfNotExists: async () => { created.push(name) },
    getBlockBlobClient: (path: string) => ({
      uploadData: async (data: Buffer, options: { blobHTTPHeaders: { blobContentType: string }; conditions?: { ifNoneMatch?: string } }) => {
        if (options.conditions?.ifNoneMatch === '*' && blobs.has(`${name}/${path}`)) throw new Error('BlobAlreadyExists')
        blobs.set(`${name}/${path}`, { data, type: options.blobHTTPHeaders.blobContentType })
      },
      deleteIfExists: async () => { blobs.delete(`${name}/${path}`) },
    }),
    getBlobClient: (path: string) => ({
      download: async () => {
        const hit = blobs.get(`${name}/${path}`)
        if (!hit) throw new Error('BlobNotFound')
        return { readableStreamBody: Readable.from([hit.data]), contentType: hit.type, contentLength: hit.data.length, etag: '"e1"' }
      },
      generateSasUrl: async (o: { expiresOn: Date }) => `https://acct.blob.core.windows.net/${name}/${path}?sig=x&se=${o.expiresOn.toISOString()}`,
    }),
  })
  return {
    BlobServiceClient: { fromConnectionString: () => ({ getContainerClient: containerClient }) },
    BlobSASPermissions: { parse: (v: string) => v },
    SASProtocol: { Https: 'https' },
  }
})

const uploadMock = vi.fn(async () => ({ error: null }))
vi.mock('@avotalent/core/services/supabase.service', () => ({
  supabase: { storage: { from: () => ({ upload: uploadMock, remove: async () => ({ error: null }), getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/avatars/${p}` } }), createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' }, error: null }) }) } },
}))

import * as azureMock from '@azure/storage-blob'
import { setAzureSdkForTest, isSafePath, putFile, publicFileUrl, publicFilePrefix, removeFiles, signedFileUrl, storageDriver, resetStorageForTest } from '@avotalent/core/services/storage/index'
import filesRoutes from '../../src/routes/files.routes'

const useAzure = () => {
  process.env.STORAGE_DRIVER = 'azure'
  process.env.AZURE_STORAGE_CONNECTION_STRING = 'fake'
  process.env.FILES_BASE_URL = 'https://api.example.test/'
  resetStorageForTest()
  setAzureSdkForTest(azureMock as never)
}

beforeEach(() => { blobs.clear(); created.length = 0; uploadMock.mockClear() })
afterEach(() => { delete process.env.STORAGE_DRIVER; delete process.env.AZURE_STORAGE_CONNECTION_STRING; delete process.env.FILES_BASE_URL })

describe('driver choice and paths', () => {
  it('uses supabase unless STORAGE_DRIVER says azure, so nothing changes until the switch', () => {
    expect(storageDriver({} as NodeJS.ProcessEnv)).toBe('supabase')
    expect(storageDriver({ STORAGE_DRIVER: 'cosa' } as unknown as NodeJS.ProcessEnv)).toBe('supabase')
    expect(storageDriver({ STORAGE_DRIVER: ' Azure ' } as unknown as NodeJS.ProcessEnv)).toBe('azure')
  })
  it('refuses unsafe paths', () => {
    for (const bad of ['', '/abs', '../x', 'a/../b', 'a\\b', 'a?b', 'x'.repeat(301)]) expect(isSafePath(bad)).toBe(false)
    for (const good of ['u-1700.png', 'community/u-1.jpg', 'generated/art-1.png']) expect(isSafePath(good)).toBe(true)
  })
})

describe('supabase driver (today)', () => {
  it('delegates upload and builds the Supabase public URL', async () => {
    expect(await putFile('avatars', 'a.png', Buffer.from('x'), { contentType: 'image/png' })).toEqual({ ok: true })
    expect(uploadMock).toHaveBeenCalled()
    expect(publicFileUrl('avatars', 'a.png')).toContain('/storage/v1/object/public/avatars/a.png')
    expect(await signedFileUrl('company-docs', 'c/1.pdf')).toBe('https://signed')
  })
})

describe('azure driver', () => {
  beforeEach(useAzure)

  it('creates the private container, uploads with its content type and never overwrites unless asked', async () => {
    expect(await putFile('avatars', 'a.png', Buffer.from('x'), { contentType: 'image/png' })).toEqual({ ok: true })
    expect(created).toEqual(['avatars'])
    expect(blobs.get('avatars/a.png')?.type).toBe('image/png')
    expect((await putFile('avatars', 'a.png', Buffer.from('y'), { contentType: 'image/png' })).ok).toBe(false)
    expect((await putFile('avatars', 'a.png', Buffer.from('y'), { contentType: 'image/png', upsert: true })).ok).toBe(true)
    expect((await putFile('avatars', '../x', Buffer.from('y'), { contentType: 'image/png' })).ok).toBe(false)
  })

  it('public URLs go through our backend, never to Azure', () => {
    expect(publicFilePrefix('images')).toBe('https://api.example.test/api/files/images/')
    expect(publicFileUrl('avatars', 'a.png')).toBe('https://api.example.test/api/files/avatars/a.png')
  })

  it('documents only come out with a short-lived signed link', async () => {
    const url = await signedFileUrl('company-docs', 'c/1.pdf', 120)
    expect(url).toContain('sig=')
    expect(await signedFileUrl('company-docs', '../x')).toBeNull()
  })

  it('removes files', async () => {
    await putFile('images', 'a.png', Buffer.from('x'), { contentType: 'image/png' })
    expect(await removeFiles('images', ['a.png'])).toBe(true)
    expect(blobs.has('images/a.png')).toBe(false)
  })
})

describe('GET /api/files', () => {
  const app = () => { const s = express(); s.use('/api/files', filesRoutes); return s }

  it('serves an image with safe headers and caching', async () => {
    useAzure()
    await putFile('avatars', 'a.png', Buffer.from('PNGDATA'), { contentType: 'image/png' })
    const res = await request(app()).get('/api/files/avatars/a.png')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toContain('max-age')
    expect(res.headers['content-security-policy']).toContain('sandbox')
  })

  it('answers 304 for an unchanged file', async () => {
    useAzure()
    await putFile('images', 'community/a.png', Buffer.from('x'), { contentType: 'image/png' })
    expect((await request(app()).get('/api/files/images/community/a.png').set('If-None-Match', '"e1"')).status).toBe(304)
  })

  it('never serves company documents, backups, odd paths or missing files', async () => {
    useAzure()
    await putFile('company-docs', 'c/1.pdf', Buffer.from('secret'), { contentType: 'application/pdf' })
    await putFile('backups', 'b.dump', Buffer.from('secret'), { contentType: 'application/octet-stream' })
    expect((await request(app()).get('/api/files/company-docs/c/1.pdf')).status).toBe(404)
    expect((await request(app()).get('/api/files/backups/b.dump')).status).toBe(404)
    expect((await request(app()).get('/api/files/avatars/..%2Fx')).status).toBe(404)
    expect((await request(app()).get('/api/files/avatars/nope.png')).status).toBe(404)
  })

  it('hands a non-image back as an opaque download (no sniffing into a page)', async () => {
    useAzure()
    await putFile('images', 'x.html', Buffer.from('<script>1</script>'), { contentType: 'text/html' })
    const res = await request(app()).get('/api/files/images/x.html')
    expect(res.headers['content-type']).toBe('application/octet-stream')
  })

  it('with the supabase driver the proxy has nothing to serve', async () => {
    expect((await request(app()).get('/api/files/avatars/a.png')).status).toBe(404)
  })
})
