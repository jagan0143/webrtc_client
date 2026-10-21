import { useEffect, useMemo, useState } from 'react';
import { errorMessage, http } from '../api/http';
import { SearchIcon, UsersIcon } from '../components/icons';
import NotificationBanner from '../components/NotificationBanner';
import UserListItem from '../components/UserListItem';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { useSocket } from '../context/SocketContext';

const byOnlineThenName = (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name);

export default function Contacts() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { startCall, canCall } = useCall();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  // Search on the server, debounced.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await http.get('/users', { params: { search: search.trim() || undefined } });
        if (!cancelled) setUsers(data.users);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Could not load contacts'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [search, reload]);

  // Live presence + newly registered users.
  useEffect(() => {
    if (!socket) return undefined;
    const onPresence = ({ userId, online }) =>
      setUsers((list) => list.map((u) => (u._id === userId ? { ...u, online } : u)).sort(byOnlineThenName));
    const onNewUser = (u) => {
      if (u._id === user?._id) return;
      setUsers((list) => (list.some((x) => x._id === u._id) ? list : [...list, u].sort(byOnlineThenName)));
    };
    // Refresh online flags after a reconnect (we may have missed presence events).
    const onConnect = () => setReload((n) => n + 1);
    socket.on('presence:update', onPresence);
    socket.on('user:new', onNewUser);
    socket.on('connect', onConnect);
    return () => {
      socket.off('presence:update', onPresence);
      socket.off('user:new', onNewUser);
      socket.off('connect', onConnect);
    };
  }, [socket, user?._id]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? users.filter((u) => u.name.toLowerCase().includes(q)) : users;
  }, [users, search]);
  const onlineCount = visible.filter((u) => u.online).length;

  return (
    <div className="contacts">
      <NotificationBanner />
      <div className="search">
        <SearchIcon size={18} />
        <input
          type="search"
          placeholder="Search contacts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search contacts"
        />
      </div>

      {error ? (
        <div className="empty">
          <p>{error}</p>
          <button type="button" className="btn secondary" onClick={() => setReload((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : loading && !users.length ? (
        <div className="empty">
          <div className="spinner" />
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <UsersIcon size={44} />
          <h3>{search ? 'No matches' : 'No one else here yet'}</h3>
          <p>{search ? `Nobody called “${search}”.` : 'Ask a friend to register, then call them from this list.'}</p>
        </div>
      ) : (
        <>
          <h4 className="section-label">
            {visible.length} {visible.length === 1 ? 'contact' : 'contacts'} · {onlineCount} online
          </h4>
          <ul className="list">
            {visible.map((u) => (
              <UserListItem key={u._id} user={u} onCall={startCall} disabled={!canCall} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
