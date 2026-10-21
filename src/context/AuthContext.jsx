import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, http, saveToken } from '../api/http';
import { forgetPushSubscription, syncPushSubscription } from '../push/push';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [bootError, setBootError] = useState('');

  // forgetDevice: stop this device receiving this user's call notifications (skip when the session is already invalid).
  const logout = useCallback(async ({ forgetDevice = true } = {}) => {
    if (forgetDevice) await forgetPushSubscription();
    saveToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const loadMe = useCallback(async () => {
    if (!getToken()) return setLoading(false);
    setLoading(true);
    setBootError('');
    try {
      const { data } = await http.get('/auth/me');
      setUser(data.user);
      void syncPushSubscription();
    } catch (err) {
      if (err.response?.status === 401) logout({ forgetDevice: false });
      else setBootError('Cannot reach the server.');
    } finally {
      setLoading(false);
    }
  }, [logout]);

  // Restore the session once on page load.
  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const startSession = useCallback(({ token: newToken, user: newUser }) => {
    saveToken(newToken);
    setToken(newToken);
    setUser(newUser);
    setBootError('');
    void syncPushSubscription();
  }, []);

  const login = useCallback(
    async (identifier, password) => startSession((await http.post('/auth/login', { identifier, password })).data),
    [startSession]
  );

  const register = useCallback(
    async (form) => startSession((await http.post('/auth/register', form)).data),
    [startSession]
  );

  const value = useMemo(
    () => ({ token, user, loading, bootError, login, register, logout, retry: loadMe }),
    [token, user, loading, bootError, login, register, logout, loadMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
