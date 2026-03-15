// Content script that runs on the 10x-studio web app (localhost and vercel)
// Its job is to bridge window.postMessage from the React app to the Chrome Extension background

window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === 'REQUEST_SUBSTACK_STATS') {
        chrome.runtime.sendMessage(
            { type: 'REQUEST_SUBSTACK_STATS', pubId: event.data.pubId, pubSlug: event.data.pubSlug },
            (response) => {
                if (chrome.runtime.lastError) {
                    window.postMessage({ type: 'SUBSTACK_STATS_RESPONSE', error: chrome.runtime.lastError.message }, '*');
                } else if (response) {
                    window.postMessage(response, '*');
                }
            }
        );
    }

    if (event.data.type === 'REQUEST_SUBSTACK_SUBSCRIBERS_GET') {
        chrome.runtime.sendMessage(
            { type: 'REQUEST_SUBSTACK_SUBSCRIBERS_GET', pubId: event.data.pubId, pubSlug: event.data.pubSlug, params: event.data.params },
            (response) => {
                if (chrome.runtime.lastError) {
                    window.postMessage({ type: 'SUBSTACK_SUBSCRIBERS_RESPONSE', error: chrome.runtime.lastError.message }, '*');
                } else if (response) {
                    window.postMessage(response, '*');
                }
            }
        );
    }

    if (event.data.type === 'REQUEST_SUBSTACK_SUBSCRIBERS_IMPORT') {
        chrome.runtime.sendMessage(
            { type: 'REQUEST_SUBSTACK_SUBSCRIBERS_IMPORT', pubId: event.data.pubId, pubSlug: event.data.pubSlug, subscribers: event.data.subscribers },
            (response) => {
                if (chrome.runtime.lastError) {
                    window.postMessage({ type: 'SUBSTACK_SUBSCRIBERS_IMPORT_RESPONSE', error: chrome.runtime.lastError.message }, '*');
                } else if (response) {
                    window.postMessage(response, '*');
                }
            }
        );
    }

    if (event.data.type === 'REQUEST_SUBSTACK_PUBLISH') {
        chrome.runtime.sendMessage(
            { type: 'REQUEST_SUBSTACK_PUBLISH', payload: event.data.payload },
            (response) => {
                if (chrome.runtime.lastError) {
                    window.postMessage({ type: 'SUBSTACK_PUBLISH_RESPONSE', error: chrome.runtime.lastError.message }, '*');
                } else if (response) {
                    window.postMessage(response, '*');
                }
            }
        );
    }
});
