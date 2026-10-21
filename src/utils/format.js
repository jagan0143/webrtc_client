export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_HUES = [152, 200, 262, 330, 20, 45, 185, 290];

export function avatarHue(id = '') {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function formatDuration(totalSec = 0) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatDurationWords(totalSec = 0) {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const formatTime = (date) =>
  new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function groupByDay(items, key = 'startedAt') {
  const groups = [];
  for (const item of items) {
    const label = dayLabel(item[key]);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** Human label for a call history row. */
export function callLabel({ direction, status }) {
  const outgoing = direction === 'outgoing';
  switch (status) {
    case 'completed':
      return outgoing ? 'Outgoing' : 'Incoming';
    case 'missed':
      return outgoing ? 'Not answered' : 'Missed';
    case 'rejected':
      return 'Declined';
    case 'busy':
      return outgoing ? 'Busy' : 'Missed · you were busy';
    case 'failed':
      return 'Call failed';
    case 'ongoing':
      return 'In progress';
    default:
      return status;
  }
}

export const isMissedIncoming = ({ direction, status }) =>
  direction === 'incoming' && (status === 'missed' || status === 'busy');
