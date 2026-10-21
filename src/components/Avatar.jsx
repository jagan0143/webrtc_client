import { avatarHue, initials } from '../utils/format';

export default function Avatar({ user, size = 44, showStatus = false, className = '' }) {
  const hue = avatarHue(user?._id || user?.name);
  return (
    <div
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38, '--hue': hue }}
      aria-hidden="true"
    >
      {initials(user?.name)}
      {showStatus && <span className={`status-dot ${user?.online ? 'online' : ''}`} />}
    </div>
  );
}
