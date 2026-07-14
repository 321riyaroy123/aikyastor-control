import ActivityPanel from "../components/activity/ActivityPanel";

// NEW page - the target architecture lists pages/Activity.jsx, but the
// original UI has no standalone "Activity" nav item (the feed is embedded
// in Dashboard and Vault instead). Provided here as a ready-to-route
// full-page view for when/if a dedicated Activity nav entry is added;
// not currently wired into App.jsx's navItems.
export default function ActivityPage({ activity, onRefresh }) {
  return (
    <div>
      <ActivityPanel activity={activity} onRefresh={onRefresh} />
    </div>
  );
}
