import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import CallOverlay from './components/CallOverlay';
import PhoneFrame from './components/PhoneFrame';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { SocketProvider } from './context/SocketContext';
import Contacts from './pages/Contacts';
import Login from './pages/Login';
import Missed from './pages/Missed';
import Profile from './pages/Profile';
import Recents from './pages/Recents';
import Register from './pages/Register';

function Splash({ error, onRetry }) {
  return (
    <div className="splash">
      <div className="logo">📞</div>
      {error ? (
        <>
          <p>{error}</p>
          <button type="button" className="btn secondary" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <div className="spinner" />
      )}
    </div>
  );
}

function RequireAuth() {
  const { user, token, loading, bootError, retry } = useAuth();
  if (loading) return <Splash />;
  if (!user && token && bootError) return <Splash error={bootError} onRetry={retry} />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return user ? <Navigate to="/contacts" replace /> : <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <CallProvider>
            <PhoneFrame>
              <Routes>
                <Route element={<GuestOnly />}>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                </Route>
                <Route element={<RequireAuth />}>
                  <Route element={<AppLayout />}>
                    <Route path="/contacts" element={<Contacts />} />
                    <Route path="/recents" element={<Recents />} />
                    <Route path="/missed" element={<Missed />} />
                    <Route path="/profile" element={<Profile />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/contacts" replace />} />
              </Routes>
              <CallOverlay />
            </PhoneFrame>
          </CallProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
