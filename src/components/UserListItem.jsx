import Avatar from './Avatar';
import { PhoneIcon, VideoIcon } from './icons';

export default function UserListItem({ user, onCall, disabled }) {
  return (
    <li className="list-item">
      <button
        type="button"
        className="list-main"
        onClick={() => onCall(user, 'audio')}
        disabled={disabled}
        aria-label={`Call ${user.name}`}
      >
        <Avatar user={user} showStatus />
        <span className="list-text">
          <span className="list-title">{user.name}</span>
          <span className={`list-sub ${user.online ? 'online-text' : ''}`}>{user.online ? 'Online' : 'Offline'}</span>
        </span>
      </button>
      <div className="list-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onCall(user, 'video')}
          disabled={disabled}
          aria-label={`Video call ${user.name}`}
        >
          <VideoIcon size={20} />
        </button>
        <button
          type="button"
          className="icon-btn primary"
          onClick={() => onCall(user, 'audio')}
          disabled={disabled}
          aria-label={`Voice call ${user.name}`}
        >
          <PhoneIcon size={20} />
        </button>
      </div>
    </li>
  );
}
