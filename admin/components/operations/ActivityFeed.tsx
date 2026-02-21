import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, StatusBadge, EmptyState } from '../ui/index.ts';

interface ActivityData {
  recentSignups: { id: string; name: string; email: string; date: string }[];
  recentPickups: { id: string; userName: string; serviceName: string; pickupDate: string; status: string; date: string }[];
  recentReferrals: { id: string; referrerName: string; referredEmail: string; status: string; date: string }[];
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const ActivityFeed: React.FC = () => {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/activity', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(setActivity)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!activity) return <EmptyState message="Failed to load activity" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Recent Signups</h3>
        <div className="space-y-3">
          {activity.recentSignups.map(s => (
            <div key={s.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-400">{s.email}</p>
              </div>
              <p className="text-xs text-gray-400">{formatDate(s.date)}</p>
            </div>
          ))}
          {activity.recentSignups.length === 0 && <p className="text-sm text-gray-400">No recent signups</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Special Pickups</h3>
        <div className="space-y-3">
          {activity.recentPickups.map(p => (
            <div key={p.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-gray-900">{p.serviceName}</p>
                <p className="text-xs text-gray-400">{p.userName}</p>
              </div>
              <StatusBadge status={p.status} />
            </div>
          ))}
          {activity.recentPickups.length === 0 && <p className="text-sm text-gray-400">No recent pickups</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Referrals</h3>
        <div className="space-y-3">
          {activity.recentReferrals.map(r => (
            <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="text-sm font-bold text-gray-900">{r.referrerName}</p>
                <p className="text-xs text-gray-400">{r.referredEmail}</p>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
          {activity.recentReferrals.length === 0 && <p className="text-sm text-gray-400">No recent referrals</p>}
        </div>
      </Card>
    </div>
  );
};

export default ActivityFeed;
