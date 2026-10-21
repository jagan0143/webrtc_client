import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/http';
import { disablePush, enablePush, getPushStatus, sendTestNotification } from './push';

export function usePushNotifications() {
  const [status, setStatus] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await getPushStatus());
    } catch {
      setStatus('unsupported');
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Permission can change in system settings while the app is in the background.
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const run = async (fn, successInfo = '') => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      setInfo(successInfo);
    } catch (err) {
      setError(err?.response ? errorMessage(err) : err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  return {
    status,
    busy,
    error,
    info,
    // enablePush() calls Notification.requestPermission() first, while still inside the tap.
    enable: () => run(enablePush, 'Notifications are on.'),
    disable: () => run(disablePush),
    sendTest: () => run(sendTestNotification, 'Test notification sent. It should arrive in a few seconds.'),
  };
}
