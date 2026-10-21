import { Outlet, useLocation } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import BottomNav from './BottomNav';

const TITLES = {
  '/contacts': 'Contacts',
  '/recents': 'Recents',
  '/missed': 'Missed calls',
  '/profile': 'Profile',
};

export default function AppLayout() {
  const { pathname } = useLocation();
  const { connected } = useSocket();
  return (
    <>
      <header className="app-bar">
        <h1>{TITLES[pathname] ?? 'CallMe'}</h1>
        <span className={`conn ${connected ? 'ok' : ''}`} title={connected ? 'Connected' : 'Connecting…'}>
          {connected ? 'Online' : 'Connecting…'}
        </span>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}
