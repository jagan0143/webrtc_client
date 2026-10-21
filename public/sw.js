/* CallMe service worker: shows incoming/missed call notifications and opens the app from them.
 * Registered from src/push/push.js as /sw.js?api=<backend URL>. */

const API_BASE = new URL(self.location.href).searchParams.get('api') || '';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-96.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  // Every push must show a notification (Safari revokes permission otherwise).
  event.waitUntil(showForPush(data));
});

function showForPush(data) {
  const name = data.from?.name || 'Someone';
  const isVideo = data.media === 'video';

  switch (data.type) {
    case 'incoming-call':
      return self.registration.showNotification(`${name} is calling`, {
        body: isVideo ? 'Incoming video call. Tap to answer.' : 'Incoming voice call. Tap to answer.',
        tag: `call-${data.callId}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [600, 300, 600, 300, 600, 300, 600, 300, 600],
        icon: ICON,
        badge: BADGE,
        timestamp: Date.now(),
        actions: [
          { action: 'answer', title: 'Answer' },
          { action: 'decline', title: 'Decline' },
        ],
        data: { type: 'incoming-call', callId: data.callId, actionToken: data.actionToken },
      });

    case 'missed-call':
      // Same tag, so it replaces the "is calling" notification.
      return self.registration.showNotification(`Missed call from ${name}`, {
        body: isVideo ? 'Missed video call' : 'Missed voice call',
        tag: `call-${data.callId}`,
        renotify: false,
        icon: ICON,
        badge: BADGE,
        timestamp: Date.now(),
        data: { type: 'missed-call', callId: data.callId, url: '/missed' },
      });

    case 'test':
      return self.registration.showNotification('CallMe notifications are on', {
        body: "You'll be notified about incoming calls, even when CallMe is closed.",
        tag: 'test',
        icon: ICON,
        badge: BADGE,
        data: { type: 'test', url: '/profile' },
      });

    default:
      return self.registration.showNotification('CallMe', { body: 'Open CallMe', icon: ICON, data: { url: '/' } });
  }
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  if (data.type === 'incoming-call') {
    if (event.action === 'decline') {
      event.waitUntil(declineCall(data));
      return;
    }
    const action = event.action === 'answer' ? 'answer' : 'open';
    event.waitUntil(
      openApp(`/?call=${encodeURIComponent(data.callId)}&action=${action}`, {
        type: 'open-call',
        callId: data.callId,
        action,
      })
    );
    return;
  }

  const url = data.url || '/';
  event.waitUntil(openApp(url, { type: 'navigate', url }));
});

/** Focus an open CallMe window and tell it what to do, or open a new one. */
async function openApp(url, message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
  if (existing) {
    await existing.focus();
    existing.postMessage(message);
    return;
  }
  await self.clients.openWindow(url);
}

async function declineCall({ callId, actionToken }) {
  try {
    await fetch(`${API_BASE}/api/push/actions/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, token: actionToken }),
    });
  } catch {
    // Offline: the call will simply time out as missed.
  }
}
