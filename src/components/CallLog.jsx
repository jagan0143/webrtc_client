import { useCallback, useEffect, useState } from 'react';
import { errorMessage, http } from '../api/http';
import { useCall } from '../context/CallContext';
import { useSocket } from '../context/SocketContext';
import { groupByDay } from '../utils/format';
import CallHistoryItem from './CallHistoryItem';

/** Shared list for Recents (type="all") and Missed (type="missed"). */
export default function CallLog({ type, emptyTitle, emptyText, EmptyIcon }) {
  const { historyVersion, startCall, canCall } = useCall();
  const { socket } = useSocket();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (pageToLoad) => {
      setLoading(true);
      setError('');
      try {
        const { data } = await http.get('/calls', { params: { type, page: pageToLoad } });
        setItems((prev) => (pageToLoad === 1 ? data.items : [...prev, ...data.items]));
        setPage(pageToLoad);
        setHasMore(data.hasMore);
      } catch (err) {
        setError(errorMessage(err, 'Could not load calls'));
      } finally {
        setLoading(false);
      }
    },
    [type]
  );

  // Reload whenever a call finishes or a missed call arrives.
  useEffect(() => {
    load(1);
  }, [load, historyVersion]);

  // Keep online dots fresh.
  useEffect(() => {
    if (!socket) return undefined;
    const onPresence = ({ userId, online }) =>
      setItems((list) =>
        list.map((c) => (c.otherUser?._id === userId ? { ...c, otherUser: { ...c.otherUser, online } } : c))
      );
    socket.on('presence:update', onPresence);
    return () => socket.off('presence:update', onPresence);
  }, [socket]);

  if (error && !items.length) {
    return (
      <div className="empty">
        <p>{error}</p>
        <button type="button" className="btn secondary" onClick={() => load(1)}>
          Try again
        </button>
      </div>
    );
  }

  if (!items.length) {
    return loading ? (
      <div className="empty">
        <div className="spinner" />
      </div>
    ) : (
      <div className="empty">
        <EmptyIcon size={44} />
        <h3>{emptyTitle}</h3>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="call-log">
      {groupByDay(items).map((group) => (
        <section key={group.label}>
          <h4 className="section-label">{group.label}</h4>
          <ul className="list">
            {group.items.map((item) => (
              <CallHistoryItem key={item._id} item={item} onCall={startCall} disabled={!canCall} />
            ))}
          </ul>
        </section>
      ))}
      {hasMore && (
        <button type="button" className="btn secondary load-more" onClick={() => load(page + 1)} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
