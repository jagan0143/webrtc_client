import { callLabel, formatDurationWords, formatTime, isMissedIncoming } from '../utils/format';
import Avatar from './Avatar';
import { ArrowDownLeftIcon, ArrowUpRightIcon, PhoneIcon, VideoIcon } from './icons';

export default function CallHistoryItem({ item, onCall, disabled }) {
  const missed = isMissedIncoming(item);
  const DirIcon = item.direction === 'outgoing' ? ArrowUpRightIcon : ArrowDownLeftIcon;
  const callable = Boolean(item.otherUser?._id);
  const CallIcon = item.media === 'video' ? VideoIcon : PhoneIcon;

  return (
    <li className="list-item">
      <button
        type="button"
        className="list-main"
        onClick={() => onCall(item.otherUser, item.media)}
        disabled={disabled || !callable}
        aria-label={`Call ${item.otherUser.name} back`}
      >
        <Avatar user={item.otherUser} showStatus />
        <span className="list-text">
          <span className={`list-title ${missed ? 'missed' : ''}`}>{item.otherUser.name}</span>
          <span className="list-sub">
            <DirIcon size={14} className={`dir-icon ${missed ? 'missed' : item.status === 'completed' ? 'ok' : ''}`} />
            {callLabel(item)}
            {item.media === 'video' && ' · Video'}
            {item.status === 'completed' && ` · ${formatDurationWords(item.durationSec)}`}
          </span>
        </span>
      </button>
      <div className="list-meta">
        <span className="list-time">{formatTime(item.startedAt)}</span>
        <button
          type="button"
          className="icon-btn ghost"
          onClick={() => onCall(item.otherUser, item.media)}
          disabled={disabled || !callable}
          aria-label={`${item.media === 'video' ? 'Video' : 'Voice'} call ${item.otherUser.name}`}
        >
          <CallIcon size={18} />
        </button>
      </div>
    </li>
  );
}
