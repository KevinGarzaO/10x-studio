import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server'
import { createPanelClient, panelFromEnv, PANEL_METRICS } from '../src/panel'

const db = { query: async () => ({ rows: [] }) } as never

async function connect(panel?: ReturnType<typeof createPanelClient>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await createServer(db, { panel }).connect(serverTransport)
  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(clientTransport)
  return client
}

describe('get_panel_metric', () => {
  it('is only offered when the panel is configured', async () => {
    expect((await (await connect()).listTools()).tools.map((tool) => tool.name)).not.toContain('get_panel_metric')
    const fake = (async () => new Response('{}')) as unknown as typeof fetch
    expect((await (await connect(createPanelClient('https://api.test', 'k'.repeat(30), fake))).listTools()).tools.map((tool) => tool.name)).toContain('get_panel_metric')
  })

  it('asks the SAME panel route with the service key and only the allowed parameters', async () => {
    const calls: { url: string; key: string | null }[] = []
    const fake = (async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), key: new Headers(init.headers).get('x-analytics-key') })
      return new Response(JSON.stringify({ traffic: { activeNew: 7 } }))
    }) as unknown as typeof fetch
    const client = await connect(createPanelClient('https://api.test/', 'k'.repeat(30), fake))
    const result = await client.callTool({ name: 'get_panel_metric', arguments: { metric: 'overview', days: 7 } })
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual({ traffic: { activeNew: 7 } })
    expect(calls).toEqual([{ url: 'https://api.test/api/admin/analytics/overview?days=7', key: 'k'.repeat(30) }])
    await client.callTool({ name: 'get_panel_metric', arguments: { metric: 'web_segments', list: 'linkedin,channel' } })
    expect(calls[1].url).toBe('https://api.test/api/admin/analytics/web/segments?list=linkedin%2Cchannel')
  })

  it('reports a panel failure as a tool error, and rejects a metric that does not exist', async () => {
    const fake = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch
    const client = await connect(createPanelClient('https://api.test', 'k'.repeat(30), fake))
    const failed = await client.callTool({ name: 'get_panel_metric', arguments: { metric: 'alerts' } })
    expect(failed.isError).toBe(true)
    expect((failed.content as { text: string }[])[0].text).toContain('401')
    expect((await client.callTool({ name: 'get_panel_metric', arguments: { metric: 'users' } })).isError).toBe(true)
  })

  it('never points at a panel route that carries people', () => {
    for (const { path } of Object.values(PANEL_METRICS)) expect(path).not.toMatch(/users|sessions|live|\/me/)
  })

  it('needs both BACKEND_URL and the key', () => {
    expect(panelFromEnv({ BACKEND_URL: 'https://x' } as never)).toBeUndefined()
    expect(panelFromEnv({ BACKEND_URL: 'https://x', ANALYTICS_SERVICE_KEY: 'k'.repeat(30) } as never)).toBeDefined()
  })
})

describe('the application key the API demands', () => {
  it('sends x-api-key only when one is configured, next to the service key', async () => {
    const seen: Array<string | null> = []
    const fake = (async (_url: URL, init: RequestInit) => {
      seen.push(new Headers(init.headers).get('x-api-key'))
      return new Response('{}')
    }) as unknown as typeof fetch
    await createPanelClient('https://api.test', 'k'.repeat(30), fake).get('/overview', {})
    await createPanelClient('https://api.test', 'k'.repeat(30), fake, 'a'.repeat(30)).get('/overview', {})
    expect(seen).toEqual([null, 'a'.repeat(30)])
  })

  it('reads it from BACKEND_API_KEY', () => {
    expect(panelFromEnv({ BACKEND_URL: 'https://api.test', ANALYTICS_SERVICE_KEY: 'k'.repeat(30), BACKEND_API_KEY: 'a'.repeat(30) } as never)).toBeDefined()
  })
})
