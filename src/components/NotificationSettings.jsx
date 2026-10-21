import { isIOS } from '../push/push';
import { usePushNotifications } from '../push/usePushNotifications';
import { BellIcon } from './icons';

const DESCRIPTIONS = {
  checking: 'Checking…',
  enabled: 'On. This device shows incoming calls even when CallMe is closed.',
  disabled: 'Off. Calls only ring while CallMe is open on screen.',
  denied: 'Blocked. Allow notifications for CallMe in your phone or browser settings, then come back.',
  'needs-install': isIOS()
    ? 'On iPhone, notifications need CallMe on your Home Screen: tap Share, then "Add to Home Screen", and open it from the icon.'
    : 'Install CallMe to your home screen to get notifications.',
  unsupported: "This browser can't show call notifications.",
  'server-disabled': 'Notifications are not set up on the server yet.',
};

export default function NotificationSettings() {
  const { status, busy, error, info, enable, disable, sendTest } = usePushNotifications();

  return (
    <div className="settings-card">
      <div className="settings-row">
        <BellIcon size={18} />
        <div className="settings-text">
          <span className="settings-title">Call notifications</span>
          <span className="settings-desc">{DESCRIPTIONS[status] ?? DESCRIPTIONS.unsupported}</span>
        </div>
        {(status === 'enabled' || status === 'disabled') && (
          <button
            type="button"
            role="switch"
            aria-checked={status === 'enabled'}
            aria-label="Call notifications"
            className={`switch ${status === 'enabled' ? 'on' : ''}`}
            onClick={status === 'enabled' ? disable : enable}
            disabled={busy}
          >
            <span className="switch-knob" />
          </button>
        )}
      </div>
      {status === 'enabled' && (
        <button type="button" className="btn secondary block small-btn" onClick={sendTest} disabled={busy}>
          Send a test notification
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
      {info && !error && <p className="settings-info">{info}</p>}
    </div>
  );
}
