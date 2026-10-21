import { NavLink } from 'react-router-dom';
import { useCall } from '../context/CallContext';
import { ClockIcon, PhoneMissedIcon, UserIcon, UsersIcon } from './icons';

const TABS = [
  { to: '/contacts', label: 'Contacts', Icon: UsersIcon },
  { to: '/recents', label: 'Recents', Icon: ClockIcon },
  { to: '/missed', label: 'Missed', Icon: PhoneMissedIcon, badge: true },
  { to: '/profile', label: 'Profile', Icon: UserIcon },
];

export default function BottomNav() {
  const { missedCount } = useCall();
  return (
    <nav className="bottom-nav">
      {TABS.map(({ to, label, Icon, badge }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <span className="tab-icon">
            <Icon size={22} />
            {badge && missedCount > 0 && (
              <span className="badge" aria-label={`${missedCount} new missed calls`}>
                {missedCount > 99 ? '99+' : missedCount}
              </span>
            )}
          </span>
          <span className="tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
