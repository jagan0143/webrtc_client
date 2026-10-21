import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../api/http';
import { useAuth } from './AuthContext';

const SocketContext = createContext({ socket: null, connected: false });

export function SocketProvider({ children }) {
  const { token, user, logout } = useAuth();
  const userId = user?._id;
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token || !userId) return undefined;

    const isVisible = () => document.visibilityState === 'visible';
    // auth is re-read on every reconnect, so the server always knows if the app is on screen.
    const s = io(API_BASE || undefined, { auth: (cb) => cb({ token, visible: isVisible() }) });
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onError = (err) => {
      if (err.message === 'Unauthorized') logout({ forgetDevice: false });
    };
    // Tells the server when the app goes to the background (so calls also send a notification),
    // and reconnects straight away when the phone brings the app back.
    const onVisibility = () => {
      if (s.connected) s.emit('client:visibility', { visible: isVisible() });
      else if (isVisible()) s.connect();
    };
    const onPageHide = () => s.connected && s.emit('client:visibility', { visible: false });
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onError);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    setSocket(s);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onError);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, userId, logout]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
