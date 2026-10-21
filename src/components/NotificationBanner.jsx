import { useState } from 'react';
import { isIOS } from '../push/push';
import { usePushNotifications } from '../push/usePushNotifications';
import { BellIcon } from './icons';

const DISMISS_KEY = 'callme.notifBanner.dismissed';

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) || '';
  } catch {
    return '';
  }
}

/** Nudges the user to turn on call notifications (or explains why they can't yet). */
export default function NotificationBanner() {
  const { status, busy, error, enable } = usePushNotifications();
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => {
    setDismissed(status);
    try {
      localStorage.setItem(DISMISS_KEY, status);
    } catch {
      /* ignore */
    }
  };

  let text;
  let action = null;
  if (status === 'disabled') {
    text = "Turn on notifications so you don't miss calls when CallMe is closed.";
    action = (
      <button type="button" className="btn primary small-btn" onClick={enable} disabled={busy}>
        {busy ? 'Turning on…' : 'Turn on'}
      </button>
    );
  } else if (status === 'needs-install' && isIOS()) {
    text = 'To get call notifications on iPhone, tap Share, then "Add to Home Screen", and open CallMe from the icon.';
  } else if (status === 'denied') {
    text = 'Notifications are blocked, so you will miss calls when CallMe is closed. Allow them in your settings.';
  } else {
    return null;
  }
  if (dismissed === status) return null;

  return (
    <div className="banner" role="status">
      <BellIcon size={20} className="banner-icon" />
      <div className="banner-body">
        <p>{text}</p>
        {error && <p className="banner-error">{error}</p>}
        {action}
      </div>
      <button type="button" className="banner-close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
