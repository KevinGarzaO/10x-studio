// Content script — runs on substack.com pages
// Detects when user is authenticated and notifies background

(function () {
  // Check if user is logged in by looking for auth indicators
  const isLoggedIn = document.cookie.includes('connect.sid') ||
    document.querySelector('[data-testid="user-menu"]') !== null ||
    document.querySelector('.user-indicator') !== null

  if (isLoggedIn) {
    chrome.runtime.sendMessage({ type: 'SUBSTACK_LOGGED_IN' })
  }

  // Listen for requests from popup to fetch profile
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FETCH_PROFILE') {
      const getProfile = async () => {
        try {
          // 1. First, we need the user's full slug (id-handle) for the explicit endpoint.
          let userHandle = '';
          let html = document.documentElement.innerHTML;

          // The most reliable way is pulling it from _preloads since it's the exact same data source Substack uses
          const preloadMatch = html.match(/window\._preloads\s*=\s*JSON\.parse\("((?:[^"\\]|\\.)*)"\)/);
          if (preloadMatch) {
            try {
              const data = JSON.parse(JSON.parse(`"${preloadMatch[1]}"`));
              if (data.user && data.user.handle) userHandle = data.user.handle;
              else if (data.pub && data.pub.author_id) {
                // Sometime we can fallback to other fields if handle is missing
              }
            } catch (e) { }
          }

          // Fallback to DOM regexes if _preloads failed
          if (!userHandle) {
            const handleMatch = html.match(/"handle":"([^"]+)"/);
            if (handleMatch) userHandle = handleMatch[1];
            else {
              const profileLinkMatch = html.match(/href="https:\/\/substack\.com\/@([^"\/]+)/);
              if (profileLinkMatch) userHandle = profileLinkMatch[1];
            }
          }

          const fullUserSlug = request.userId && userHandle ? `${request.userId}-${userHandle}` : (request.userId ? request.userId.toString() : null);

          // Execute ONLY the user's explicit endpoint (as requested, ignoring subscriber/me)
          let pubData = null;
          if (fullUserSlug) {
            const pubRes = await fetch(`https://substack.com/api/v1/user/${fullUserSlug}/public_profile/self`).catch(() => null);
            if (pubRes && pubRes.ok) pubData = await pubRes.json();
          }

          if (pubData) {
            // pubData actually contains primaryPublication, subscriberCountNumber, and rich profile info!
            let subdomain = pubData.primaryPublication?.subdomain || '';
            let publicationName = pubData.primaryPublication?.name || '';
            let subCount = pubData.subscriberCountNumber || 0;
            let bio = pubData.bio || '';
            let links = pubData.userLinks || [];
            let followerCount = pubData.followerCount || 0;
            let handle = pubData.handle || '';
            let pubLogo = pubData.primaryPublication?.logo_url || '';

            // Optional fallback just in case some older accounts don't have it natively
            if (!subdomain || !publicationName || !subCount) {
              const preloadMatchFallback = html.match(/window\._preloads\s*=\s*JSON\.parse\("((?:[^"\\]|\\.)*)"\)/);
              if (preloadMatchFallback) {
                try {
                  const rawPreloads = JSON.parse(`"${preloadMatchFallback[1]}"`);
                  const subMatch = rawPreloads.match(/"subdomain":"([^"]+)"/);
                  if (subMatch && !subdomain) subdomain = subMatch[1];

                  const nameMatch = rawPreloads.match(/"subdomain":"[^"]+".*?"name":"([^"]+)"/);
                  if (nameMatch && !publicationName) publicationName = nameMatch[1];

                  const countMatch = rawPreloads.match(/"subscriber_count":(\d+)/);
                  if (countMatch && !subCount) subCount = parseInt(countMatch[1], 10);
                } catch (e) { }
              }
            }

            return {
              ok: true,
              profile: {
                name: pubData.name || 'Usuario',
                handle: handle,
                bio: bio,
                email: '', // Not provided by public_profile
                photo_url: pubData.photo_url || '',
                primaryPublication: { subdomain, name: publicationName, subscriber_count: subCount, logo_url: pubLogo },
                links: links,
                followerCount: followerCount,
                pubId: pubData.primaryPublication?.id || request.userId
              }
            };
          }

          // 3. Fallback: Parse DOM directly
          let extracted = null;
          html = document.documentElement.innerHTML;

          const preloadMatchFallback = html.match(/window\._preloads\s*=\s*JSON\.parse\("((?:[^"\\]|\\.)*)"\)/);
          if (preloadMatchFallback) {
            try {
              const data = JSON.parse(JSON.parse(`"${preloadMatchFallback[1]}"`));
              extracted = data.user || data.pub || null;
              if (extracted && data.pub && data.pub.id) extracted.pubId = data.pub.id;
            } catch (e) { }
          }

          if (!extracted) {
            const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
            if (nextMatch) {
              try {
                const nextData = JSON.parse(nextMatch[1]);
                extracted = nextData?.props?.pageProps?.user || nextData?.props?.pageProps?.pub || null;
                const pubData = nextData?.props?.pageProps?.pub;
                if (extracted && pubData?.id) extracted.pubId = pubData.id;
              } catch (e) { }
            }
          }

          if (!extracted) {
            const nameEl = document.querySelector('.user-name, [data-testid="user-menu"] span, .ProfileCard-name');
            const imgEl = document.querySelector('.user-image img, [data-testid="user-menu"] img, .avatar img');
            const hostParts = window.location.hostname.split('.');
            let subdomain = '';
            if (hostParts.length >= 3 && hostParts[1] === 'substack') subdomain = hostParts[0];

            extracted = {
              name: nameEl ? nameEl.textContent.trim() : 'Perfil Extraído',
              primaryPublication: { subdomain },
              pubId: 0
            };
          }

          return { ok: true, profile: extracted };

        } catch (err) {
          return { ok: false, error: err.message };
        }
      };

      getProfile().then(sendResponse);
      return true; // Keep channel open for async response
    }

    // NEW MESSAGE HANDLER: Fetch stats natively to bypass Cloudflare
    if (request.type === 'FETCH_STATS') {
      const pubId = request.pubId;
      const pubSlug = request.pubSlug;

      if (!pubId || !pubSlug) {
        sendResponse({ ok: false, error: 'Missing pubId or pubSlug in request' });
        return false;
      }

      Promise.allSettled([
        fetch(`https://substack.com/api/v1/publication/${pubId}/subscribers/count`).then(r => r.ok ? r.json() : null),
        fetch(`https://${pubSlug}.substack.com/api/v1/archive?sort=new&search=&offset=0&limit=12`).then(r => r.ok ? r.json() : [])
      ])
        .then(([subsResult, postsResult]) => {
          const subs = subsResult.status === 'fulfilled' && subsResult.value ? subsResult.value : { total: 0, free: 0, paid: 0 };
          const posts = postsResult.status === 'fulfilled' && postsResult.value ? postsResult.value : [];

          sendResponse({ ok: true, stats: { subs, posts } });
        })
        .catch(err => {
          sendResponse({ ok: false, error: err.message });
        });

      return true; // Keep channel open for async response
    }

    // NEW MESSAGE HANDLER: Publish content natively
    if (request.type === 'PUBLISH_POST') {
      const payload = request.payload;

      const publishAsync = async () => {
        try {
          // First get the pubSlug explicitly
          let pubSlug = '';
          const meRes = await fetch('https://substack.com/api/v1/subscriber/me').catch(() => null);
          if (meRes && meRes.ok) {
            const data = await meRes.json();
            if (data.primaryPublication) pubSlug = data.primaryPublication.subdomain;
          }
          if (!pubSlug) throw new Error("No se pudo identificar tu publicación de Substack.");

          // Helper to convert md to prosemirror blocks
          const mdToProseMirror = (md) => {
            const nodes = [];
            for (const line of md.split('\n')) {
              const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
              if (!line.trim()) {
                nodes.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] });
              } else if (line.startsWith('# ')) {
                nodes.push({ type: 'heading', attrs: { level: 1, id: null }, content: [{ type: 'text', text: line.replace(/^# /, '') }] });
              } else if (line.startsWith('## ')) {
                nodes.push({ type: 'heading', attrs: { level: 2, id: null }, content: [{ type: 'text', text: line.replace(/^## /, '') }] });
              } else if (line.startsWith('### ')) {
                nodes.push({ type: 'heading', attrs: { level: 3, id: null }, content: [{ type: 'text', text: line.replace(/^### /, '') }] });
              } else if (line.startsWith('- ') || line.startsWith('* ')) {
                nodes.push({ type: 'bullet_list', content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: clean.replace(/^[-*] /, '') }] }] }] });
              } else {
                nodes.push({ type: 'paragraph', content: [{ type: 'text', text: clean }] });
              }
            }
            return nodes;
          };

          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };

          if (payload.type === 'note') {
            const res = await fetch('https://substack.com/api/v1/comment/feed', {
              method: 'POST',
              headers,
              body: JSON.stringify({ body: payload.content, type: 'feed' }),
            });
            if (!res.ok) throw new Error(`Error en Note: ${res.status}`);
            const data = await res.json();
            return { ok: true, id: data.id, url: data.url };

          } else if (payload.type === 'article') {
            const pubHeaders = { ...headers, 'Referer': `https://${pubSlug}.substack.com/` };

            // 1. Create Draft
            const draftRes = await fetch(`https://${pubSlug}.substack.com/api/v1/drafts`, {
              method: 'POST',
              headers: pubHeaders,
              body: JSON.stringify({
                type: 'newsletter',
                draft_title: payload.title.trim(),
                draft_subtitle: (payload.subtitle || '').trim(),
                draft_body: JSON.stringify({
                  type: 'doc',
                  attrs: { schemaVersion: 'v1' },
                  content: mdToProseMirror(payload.content),
                }),
                audience: 'everyone',
                section_chosen: false,
                draft_section_id: null,
              }),
            });
            if (!draftRes.ok) throw new Error(`Error creando borrador: ${draftRes.status}`);
            const draft = await draftRes.json();

            // 2. Publish Draft
            const postRes = await fetch(`https://${pubSlug}.substack.com/api/v1/drafts/${draft.id}/publish`, {
              method: 'POST',
              headers: pubHeaders,
              body: JSON.stringify({ send_email: true, audience: 'everyone', send_at: null }),
            });
            if (!postRes.ok) throw new Error(`Error publicando: ${postRes.status}`);

            return { ok: true, id: draft.id };
          }
        } catch (err) {
          return { ok: false, error: err.message };
        }
      };

      publishAsync().then(sendResponse);
      return true;
    }
  })
})()
