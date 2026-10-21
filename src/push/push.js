import { API_BASE, http } from '../api/http';

// ---------- environment checks ----------

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Opened from the Home Screen icon rather than a browser tab. */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

const hasPushApis = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// ---------- service worker ----------

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  // The worker needs the backend URL for the notification "Decline" button.
  return navigator.serviceWorker
    .register(`/sw.js?api=${encodeURIComponent(API_BASE)}`, { scope: '/' })
    .catch((err) => {
      console.warn('Service worker registration failed', err);
      return null;
    });
}

const getRegistration = async () =>
  ('serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration('/'))) || null;

/** Close notifications whose data matches, e.g. once a call is shown in the app. */
export async function closeNotifications(match) {
  try {
    const reg = await getRegistration();
    const list = (await reg?.getNotifications()) || [];
    list.forEach((n) => match(n.data || {}) && n.close());
  } catch {
    /* not supported */
  }
}

// ---------- server config ----------

let configPromise = null;
function getServerConfig() {
  configPromise ??= http
    .get('/push/config')
    .then(({ data }) => data)
    .catch(() => {
      configPromise = null;
      return { enabled: false, publicKey: null };
    });
  return configPromise;
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ---------- status ----------

/**
 * 'enabled' | 'disabled' (can be turned on) | 'denied' (blocked in settings) |
 * 'needs-install' (iPhone in a Safari tab) | 'unsupported' | 'server-disabled'
 */
export async function getPushStatus() {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!hasPushApis()) return 'unsupported';
  const config = await getServerConfig();
  if (!config.enabled) return 'server-disabled';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return Notification.permission === 'granted' && sub ? 'enabled' : 'disabled';
}

// ---------- subscribe / unsubscribe ----------

async function subscribeAndSave() {
  const config = await getServerConfig();
  if (!config.enabled) throw new Error('Notifications are not set up on the server yet.');
  const reg = (await getRegistration()) || (await registerServiceWorker());
  if (!reg) throw new Error('This browser cannot run the notification service.');
  await navigator.serviceWorker.ready;

  const key = urlBase64ToUint8Array(config.publicKey);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an old server key can't be reused.
  const currentKey = sub?.options?.applicationServerKey;
  if (sub && currentKey && new Uint8Array(currentKey).toString() !== key.toString()) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await http.post('/push/subscribe', { subscription: sub.toJSON() });
}

/** Must be called from a tap/click (iOS only shows the permission prompt for a user gesture). */
export async function enablePush() {
  if (isIOS() && !isStandalone()) throw new Error('Add CallMe to your Home Screen first, then open it from there.');
  if (!hasPushApis()) throw new Error('This browser does not support notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked. Allow them for CallMe in your phone or browser settings.'
        : 'Notifications were not allowed.'
    );
  }
  await subscribeAndSave();
}

export async function disablePush() {
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await http.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** After login: if this device already allowed notifications, (re)register it for the current user. */
export async function syncPushSubscription() {
  try {
    if (!hasPushApis() || Notification.permission !== 'granted') return;
    if (isIOS() && !isStandalone()) return;
    await subscribeAndSave();
  } catch (err) {
    console.warn('Could not sync push subscription', err);
  }
}

/** Before logout: stop this device getting the old user's calls. */
export async function forgetPushSubscription() {
  try {
    const sub = await (await getRegistration())?.pushManager.getSubscription();
    if (sub) await http.post('/push/unsubscribe', { endpoint: sub.endpoint }, { timeout: 4000 });
  } catch {
    /* best effort */
  }
}

export const sendTestNotification = () => http.post('/push/test');
