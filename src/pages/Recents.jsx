import CallLog from '../components/CallLog';
import { ClockIcon } from '../components/icons';

export default function Recents() {
  return (
    <CallLog
      type="all"
      EmptyIcon={ClockIcon}
      emptyTitle="No calls yet"
      emptyText="Calls you make and receive will show up here."
    />
  );
}
