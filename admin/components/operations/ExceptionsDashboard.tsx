import React, { useState, useEffect, useCallback } from 'react';

interface ExceptionData {
  unmatchedOnDemand: Array<{ id: string; service_name: string; requested_date: string; address: string; created_at: string }>;
  escalatedMissed: Array<{ id: string; reported_date: string; status: string; address: string; created_at: string }>;
  expiredBids: Array<{ id: string; title: string; scheduled_date: string; status: string; created_at: string }>;
  failedAssignments: Array<{ id: string; location_id: string; failure_reason: string; created_at: string; address: string }>;
  staleDraftRoutes: Array<{ id: string; title: string; scheduled_date: string; created_at: string; order_count: number }>;
  totalExceptions: number;
}

const ExceptionsDashboard: React.FC = () => {
  const [data, setData] = useState<ExceptionData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/exceptions', { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading exceptions...</div>;
  if (!data) return <div className="p-8 text-center text-red-500">Failed to load exceptions</div>;

  if (data.totalExceptions === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-4xl mb-3">&#9989;</div>
        <h3 className="text-lg font-black text-gray-800">All Clear</h3>
        <p className="text-sm text-gray-500 mt-1">No exceptions requiring attention. The platform is running on autopilot.</p>
      </div>
    );
  }

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return d; }
  };
  const formatTime = (d: string) => {
    try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900">Exceptions</h2>
          <p className="text-sm text-gray-500">Items requiring admin attention — {data.totalExceptions} total</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors">
          Refresh
        </button>
      </div>

      {/* Unmatched On-Demand */}
      {data.unmatchedOnDemand.length > 0 && (
        <Section title="Unmatched On-Demand Requests" count={data.unmatchedOnDemand.length} color="red">
          {data.unmatchedOnDemand.map(r => (
            <Row key={r.id} primary={r.address} secondary={`${r.service_name} — requested ${formatDate(r.requested_date)}`} meta={`Submitted ${formatTime(r.created_at)}`} />
          ))}
        </Section>
      )}

      {/* Escalated Missed Collections */}
      {data.escalatedMissed.length > 0 && (
        <Section title="Unresolved Missed Collections" count={data.escalatedMissed.length} color="amber">
          {data.escalatedMissed.map(r => (
            <Row key={r.id} primary={r.address} secondary={`Reported ${formatDate(r.reported_date)}`} meta={r.status === 'escalated' ? 'ESCALATED' : 'Pending'} />
          ))}
        </Section>
      )}

      {/* Routes With No Bids */}
      {data.expiredBids.length > 0 && (
        <Section title="Routes With No Bidders" count={data.expiredBids.length} color="orange">
          {data.expiredBids.map(r => (
            <Row key={r.id} primary={r.title} secondary={`Scheduled ${formatDate(r.scheduled_date)}`} meta={`Open since ${formatTime(r.created_at)}`} />
          ))}
        </Section>
      )}

      {/* Failed Auto-Assignments */}
      {data.failedAssignments.length > 0 && (
        <Section title="Failed Auto-Assignments (7 days)" count={data.failedAssignments.length} color="purple">
          {data.failedAssignments.map(r => (
            <Row key={r.id} primary={r.address} secondary={r.failure_reason} meta={formatTime(r.created_at)} />
          ))}
        </Section>
      )}

      {/* Stale Draft Routes */}
      {data.staleDraftRoutes.length > 0 && (
        <Section title="Unpublished Drafts (Next 3 Days)" count={data.staleDraftRoutes.length} color="gray">
          {data.staleDraftRoutes.map(r => (
            <Row key={r.id} primary={r.title} secondary={`${r.order_count} orders — scheduled ${formatDate(r.scheduled_date)}`} meta="Draft" />
          ))}
        </Section>
      )}
    </div>
  );
};

const COLORS: Record<string, string> = {
  red: 'border-red-200 bg-red-50',
  amber: 'border-amber-200 bg-amber-50',
  orange: 'border-orange-200 bg-orange-50',
  purple: 'border-purple-200 bg-purple-50',
  gray: 'border-gray-200 bg-gray-50',
};

const BADGE_COLORS: Record<string, string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  gray: 'bg-gray-500',
};

const Section: React.FC<{ title: string; count: number; color: string; children: React.ReactNode }> = ({ title, count, color, children }) => (
  <div className={`border rounded-xl overflow-hidden ${COLORS[color] || COLORS.gray}`}>
    <div className="px-4 py-3 flex items-center gap-2">
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white ${BADGE_COLORS[color] || BADGE_COLORS.gray}`}>{count}</span>
      <h3 className="text-sm font-black text-gray-800">{title}</h3>
    </div>
    <div className="bg-white divide-y divide-gray-100">{children}</div>
  </div>
);

const Row: React.FC<{ primary: string; secondary: string; meta: string }> = ({ primary, secondary, meta }) => (
  <div className="px-4 py-2.5 flex items-center justify-between gap-4">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-gray-900 truncate">{primary}</div>
      <div className="text-xs text-gray-500 truncate">{secondary}</div>
    </div>
    <div className="text-xs text-gray-400 whitespace-nowrap">{meta}</div>
  </div>
);

export default ExceptionsDashboard;
