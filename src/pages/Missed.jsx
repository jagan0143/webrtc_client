import { useEffect } from 'react';
import CallLog from '../components/CallLog';
import { PhoneMissedIcon } from '../components/icons';
import { useCall } from '../context/CallContext';

export default function Missed() {
  const { markMissedSeen, missedCount } = useCall();

  // Opening this tab (or a new missed call arriving while it's open) clears the badge.
  useEffect(() => {
    if (missedCount > 0) markMissedSeen();
  }, [missedCount, markMissedSeen]);

  return (
    <CallLog
      type="missed"
      EmptyIcon={PhoneMissedIcon}
      emptyTitle="No missed calls"
      emptyText="You're all caught up."
    />
  );
}
