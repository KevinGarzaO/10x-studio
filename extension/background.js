// Check session expiry every 24 hours and update badge
function checkExpiry() {
  chrome.storage.local.get(['substackConnected', 'substackProfile'], ({ substackConnected, substackProfile }) => {
    if (!substackConnected || !substackProfile?.expiresAt) {
      chrome.action.setBadgeText({ text: '' })
      return
    }
    const days = Math.round((new Date(substackProfile.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24))
    if (days <= 0) {
      chrome.action.setBadgeText({ text: '✕' })
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
    } else if (days <= 7) {
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' })
    } else {
      chrome.action.setBadgeText({ text: '' })
    }
  })
}

// Run on install and every 24h
chrome.runtime.onInstalled.addListener(checkExpiry)
setInterval(checkExpiry, 24 * 60 * 60 * 1000)

// Watch for cookie removal (logout)
chrome.cookies.onChanged.addListener((change) => {
  if (
    change.cookie.domain.includes('substack.com') &&
    (change.cookie.name === 'substack.sid' || change.cookie.name === 'connect.sid') &&
    change.removed
  ) {
    chrome.storage.local.set({ substackConnected: false, substackProfile: null })
    chrome.action.setBadgeText({ text: '!' })
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
  }
})

// Relay messages from the 10x web app
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'REQUEST_SUBSTACK_STATS') {
    const pubId = request.pubId;
    const pubSlug = request.pubSlug;

    if (!pubId || !pubSlug) {
      sendResponse({ type: 'SUBSTACK_STATS_RESPONSE', error: 'Missing pubId or pubSlug in request' });
      return true;
    }

    Promise.allSettled([
      fetch(`https://substack.com/api/v1/publication/${pubId}/subscribers/count`).then(r => r.ok ? r.json() : null),
      fetch(`https://${pubSlug}.substack.com/api/v1/archive?sort=new&search=&offset=0&limit=12`).then(r => r.ok ? r.json() : [])
    ])
      .then(([subsResult, postsResult]) => {
        const subs = subsResult.status === 'fulfilled' && subsResult.value ? subsResult.value : { total: 0, free: 0, paid: 0 };
        const posts = postsResult.status === 'fulfilled' && postsResult.value ? postsResult.value : [];
        sendResponse({ type: 'SUBSTACK_STATS_RESPONSE', stats: { subs, posts } });
      })
      .catch(err => {
        sendResponse({ type: 'SUBSTACK_STATS_RESPONSE', error: err.message });
      });

    return true; // Keep channel open
  }

  if (request.type === 'REQUEST_SUBSTACK_SUBSCRIBERS_GET') {
    const pubId = request.pubId;
    const pubSlug = request.pubSlug;
    const params = request.params || {};

    if (!pubId || !pubSlug) {
      sendResponse({ type: 'SUBSTACK_SUBSCRIBERS_RESPONSE', error: 'Falta pubId o pubSlug' });
      return true;
    }

    const payload = {
      filters: {
        [(params.dir === 'asc' ? 'order_by_asc_nulls_last' : 'order_by_desc_nulls_last')]: params.orderField || "subscription_created_at"
      },
      limit: Number(params.limit) || 50,
      offset: Number(params.offset) || 0
    };

    if (params.type === 'free') Object.assign(payload.filters, { subscription_tier: "free" });
    if (params.type === 'paid') Object.assign(payload.filters, { subscription_tier: "paid" });

    fetch(`https://${pubSlug}.substack.com/api/v1/subscriber-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`Error ${res.status}`)))
      .then(data => {
        sendResponse({ type: 'SUBSTACK_SUBSCRIBERS_RESPONSE', data });
      })
      .catch(err => {
        sendResponse({ type: 'SUBSTACK_SUBSCRIBERS_RESPONSE', error: err.message });
      });

    return true; // Keep channel open
  }

  if (request.type === 'REQUEST_SUBSTACK_SUBSCRIBERS_IMPORT') {
    const pubId = request.pubId;
    const pubSlug = request.pubSlug;
    const subscribers = request.subscribers || [];

    if (!pubId || !pubSlug || !subscribers.length) {
      sendResponse({ type: 'SUBSTACK_SUBSCRIBERS_IMPORT_RESPONSE', error: 'Falta pubId, pubSlug o lista vacía' });
      return true;
    }

    fetch(`https://${pubSlug}.substack.com/api/v1/subscribers/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribers })
    })
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`Error ${res.status}`)))
      .then(data => {
        sendResponse({ type: 'SUBSTACK_SUBSCRIBERS_IMPORT_RESPONSE', data });
      })
      .catch(err => {
        sendResponse({ type: 'SUBSTACK_SUBSCRIBERS_IMPORT_RESPONSE', error: err.message });
      });

    return true;
  }

  if (request.type === 'REQUEST_SUBSTACK_PUBLISH') {
    chrome.tabs.query({ url: "*://*.substack.com/*" }, (tabs) => {
      const responseType = 'SUBSTACK_PUBLISH_RESPONSE';

      if (!tabs || tabs.length === 0) {
        sendResponse({ type: responseType, error: 'No hay ninguna pestaña de Substack abierta. Por favor abre substack.com.' });
        return;
      }

      // Send to the first Substack tab
      chrome.tabs.sendMessage(tabs[0].id, { type: 'PUBLISH_POST', payload: request.payload }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ type: responseType, error: 'Error comunicando con Substack: ' + chrome.runtime.lastError.message });
        } else if (!response || !response.ok) {
          sendResponse({ type: responseType, error: response?.error || 'Error desconocido al publicar.' });
        } else {
          sendResponse({ type: responseType, data: response });
        }
      });
    });
    return true; // Keep channel open
  }
});
