import Avatar from '../components/Avatar';
import { LogOutIcon, MailIcon, MapPinIcon, PhoneIcon } from '../components/icons';
import NotificationSettings from '../components/NotificationSettings';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="profile">
      <div className="profile-head">
        <Avatar user={user} size={96} />
        <h2>{user.name}</h2>
        <p className="muted">
          Member since {new Date(user.createdAt).toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <ul className="detail-list">
        <li>
          <PhoneIcon size={18} />
          <div>
            <span className="detail-label">Mobile</span>
            <span>{user.mobile}</span>
          </div>
        </li>
        <li>
          <MailIcon size={18} />
          <div>
            <span className="detail-label">Email</span>
            <span>{user.email}</span>
          </div>
        </li>
        <li>
          <MapPinIcon size={18} />
          <div>
            <span className="detail-label">Address</span>
            <span>{user.address}</span>
          </div>
        </li>
      </ul>
      <p className="muted small center">Your mobile number and email are private and never shown to other users.</p>

      <NotificationSettings />

      <button type="button" className="btn danger-outline block" onClick={logout}>
        <LogOutIcon size={18} /> Log out
      </button>
    </div>
  );
}
