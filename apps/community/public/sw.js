/* Avisos push de AvoTalent. Solo muestra el aviso y, al tocarlo, abre la dirección que trae y cuenta el clic. No guarda nada en caché. */
/* La dirección del backend llega en la propia dirección del service worker (/sw.js?api=...): un archivo público no lee variables de entorno. */
const API_URL = new URL(self.location.href).searchParams.get('api') || ''

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (error) { data = {} }
  const title = data.title || 'AvoTalent'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/apple-icon.png',
      badge: '/icon-light-32x32.png',
      tag: data.nid || data.type || 'avotalent',
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/', nid: data.nid || null },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const { url, nid } = event.notification.data || {}
  const target = new URL(url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      if (nid && API_URL) {
        try {
          await fetch(API_URL + '/api/community/push/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nid }), keepalive: true })
        } catch (error) { /* medir nunca debe estorbar */ }
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.navigate(target).catch(() => undefined)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })(),
  )
})
