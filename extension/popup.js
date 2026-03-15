const DEFAULT_APP_URL = 'http://localhost:3000'

const SUBSTACK_COOKIE_NAMES = [
  'substack.sid', 'connect.sid', 'substack-sid', '__cf_bm', 'cf_clearance', 'substack.lli', 'visit_id', 'ajs_anonymous_id'
]

async function getAppUrl() {
  return new Promise(resolve => chrome.storage.local.get(['appUrl'], r => resolve(r.appUrl || DEFAULT_APP_URL)))
}

function showMsg(text, type = 'error') {
  const box = document.getElementById('msgBox')
  box.innerHTML = `<div class="${type}">${text}</div>`
  setTimeout(() => { box.innerHTML = '' }, 6000)
}

function daysUntil(isoDate) {
  if (!isoDate) return null
  return Math.max(0, Math.round((new Date(isoDate) - Date.now()) / (1000 * 60 * 60 * 24)))
}

function renderProfile(profile, publication) {
  if (!profile) return

  // Show profile card, hide status card
  document.getElementById('profileCard').classList.add('visible')
  document.getElementById('statusCard').style.display = 'none'
  document.getElementById('actionConnect').style.display = 'none'
  document.getElementById('actionConnected').style.display = 'block'

  // Avatar
  const avatarWrap = document.getElementById('avatarWrap')
  if (profile.avatar) {
    avatarWrap.innerHTML = `<img src="${profile.avatar}" class="avatar" onerror="this.style.display='none'" />`
  } else {
    const initial = (profile.name || publication || '?')[0].toUpperCase()
    avatarWrap.innerHTML = `<div class="avatar-placeholder">${initial}</div>`
  }

  document.getElementById('profileName').textContent = profile.name || 'Usuario Substack'
  document.getElementById('profileEmail').textContent = profile.email || ''
  document.getElementById('profilePub').textContent = publication ? `📰 ${publication}` : ''

  // Stats
  document.getElementById('statSubs').textContent = profile.subCount != null
    ? Number(profile.subCount).toLocaleString('es') : '—'

  const days = daysUntil(profile.expiresAt)
  document.getElementById('statDays').textContent = days != null ? String(days) : '—'

  // Expiry bar
  const bar = document.getElementById('expiryBar')
  if (days == null) {
    bar.style.display = 'none'
  } else if (days > 14) {
    bar.className = 'expiry-bar expiry-ok'
    bar.textContent = `✅ Sesión activa — expira en ${days} días`
  } else if (days > 5) {
    bar.className = 'expiry-bar expiry-warn'
    bar.textContent = `⚠️ Sesión expira en ${days} días — actualiza pronto`
  } else {
    bar.className = 'expiry-bar expiry-danger'
    bar.textContent = `🔴 Sesión expira en ${days} días — actualiza ahora`
  }
}

function setStatusLoading(msg = 'Verificando con Substack...') {
  document.getElementById('profileCard').classList.remove('visible')
  document.getElementById('statusCard').style.display = 'block'
  document.getElementById('statusDot').className = 'dot dot-yellow'
  document.getElementById('statusLabel').textContent = msg
  document.getElementById('statusSub').textContent = ''
}

function setStatusDisconnected(sub = 'Inicia sesión en Substack primero') {
  document.getElementById('profileCard').classList.remove('visible')
  document.getElementById('statusCard').style.display = 'block'
  document.getElementById('statusDot').className = 'dot dot-red'
  document.getElementById('statusLabel').textContent = 'No conectado'
  document.getElementById('statusSub').textContent = sub
  document.getElementById('actionConnect').style.display = 'block'
  document.getElementById('actionConnected').style.display = 'none'
}

async function reloadAppTab(appUrl) {
  // Reload the app tab if open, or do nothing
  chrome.tabs.query({ url: `${appUrl}/*` }, tabs => {
    if (tabs.length > 0) {
      chrome.tabs.reload(tabs[0].id)
    }
  })
}

async function grabCookiesAndSend() {
  setStatusLoading('Buscando cookies...')

  const allCookies = {}
  for (const name of SUBSTACK_COOKIE_NAMES) {
    const cookie = await new Promise(resolve => chrome.cookies.get({ url: 'https://substack.com', name }, c => resolve(c)))
    if (cookie) allCookies[name] = cookie.value
  }

  const hasSession = allCookies['substack.sid'] || allCookies['connect.sid'] || allCookies['substack-sid']
  if (!hasSession) {
    setStatusDisconnected()
    showMsg('No se encontró sesión de Substack. ¿Estás logueado en substack.com?', 'error')
    return
  }

  setStatusLoading('Obteniendo perfil de Substack...')

  let profile = null

  // We must ask a real Substack tab to fetch this so Cloudflare doesn't block us as an extension
  try {
    const tabs = await new Promise(resolve => chrome.tabs.query({ url: "*://*.substack.com/*" }, resolve))
    if (!tabs || tabs.length === 0) {
      setStatusDisconnected()
      showMsg('Debes abrir una pestaña a substack.com para poder conectar.', 'error')
      return
    }

    let userId = null;
    if (allCookies['substack.lli']) {
      try {
        const payload = JSON.parse(atob(allCookies['substack.lli'].split('.')[1]));
        userId = payload.userId;
      } catch (e) { }
    }

    const response = await new Promise(resolve => {
      // Try the first open substack tab
      chrome.tabs.sendMessage(tabs[0].id, { type: 'FETCH_PROFILE', userId }, res => resolve(res))
    })

    if (!response || !response.ok) {
      setStatusDisconnected()
      showMsg(response?.error ? `Error: ${response.error}` : 'Recarga tu pestaña de Substack y vuelve a intentar', 'error')
      return
    }

    profile = response.profile

  } catch (e) {
    setStatusDisconnected()
    showMsg('No se pudo acceder a Substack desde la extensión', 'error')
    return
  }

  setStatusLoading('Conectando con tu app...')

  const appUrl = await getAppUrl()
  try {
    const res = await fetch(`${appUrl}/api/substack/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: allCookies, profileVerified: true, profile })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setStatusDisconnected(err.error || `Error ${res.status}`)
      showMsg(err.error || 'No se pudo conectar', 'error')
      return
    }

    const data = await res.json()

    // Save locally
    chrome.storage.local.set({
      substackConnected: true,
      substackPublication: data.publication,
      substackProfile: { name: data.name, email: data.email, avatar: data.avatar, subCount: data.subCount, expiresAt: data.expiresAt },
    })

    // Update badge
    chrome.action.setBadgeText({ text: '' })

    // Render profile in popup
    renderProfile(
      { name: data.name, email: data.email, avatar: data.avatar, subCount: data.subCount, expiresAt: data.expiresAt },
      data.publication
    )

    showMsg(`✅ Conectado como ${data.name || data.email}`, 'success')

    // Reload app tab automatically
    await reloadAppTab(appUrl)

  } catch (e) {
    setStatusDisconnected()
    showMsg(`No se pudo conectar con tu app en ${appUrl}. ¿Está corriendo npm run dev?`, 'error')
  }
}

async function disconnect() {
  const appUrl = await getAppUrl()
  try { await fetch(`${appUrl}/api/substack/connect`, { method: 'DELETE' }) } catch { }
  chrome.storage.local.set({ substackConnected: false, substackPublication: '', substackProfile: null })
  chrome.action.setBadgeText({ text: '' })
  setStatusDisconnected()

  // Reload app tab
  await reloadAppTab(appUrl)
}

async function debugCookies() {
  const found = []
  for (const name of SUBSTACK_COOKIE_NAMES) {
    const c = await new Promise(resolve => chrome.cookies.get({ url: 'https://substack.com', name }, r => resolve(r)))
    if (c) found.push(name)
  }
  showMsg(
    found.length > 0 ? `Cookies encontradas: ${found.join(', ')}` : 'Sin cookies — ¿estás logueado en substack.com?',
    found.length > 0 ? 'success' : 'error'
  )
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  const appUrlInput = document.getElementById('appUrl')
  const appUrl = await getAppUrl()
  appUrlInput.value = appUrl

  appUrlInput.addEventListener('blur', () => {
    chrome.storage.local.set({ appUrl: appUrlInput.value.trim() || DEFAULT_APP_URL })
  })

  // Load stored state
  const stored = await new Promise(resolve => {
    chrome.storage.local.get(['substackConnected', 'substackPublication', 'substackProfile'], r => resolve(r))
  })

  if (stored.substackConnected && stored.substackProfile) {
    renderProfile(stored.substackProfile, stored.substackPublication)
  } else {
    setStatusDisconnected()
  }

  document.getElementById('btnConnect').addEventListener('click', grabCookiesAndSend)
  document.getElementById('btnRefresh').addEventListener('click', grabCookiesAndSend)
  document.getElementById('btnDisconnect').addEventListener('click', disconnect)
  document.getElementById('btnDebug').addEventListener('click', debugCookies)
})
