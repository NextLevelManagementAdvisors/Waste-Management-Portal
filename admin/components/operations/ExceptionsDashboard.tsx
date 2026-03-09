import React, { useState, useEffect, useCallback } from 'react';

interface ExceptionData {
  unmatchedOnDemand: Array<{ id: string; service_name: string; requested_date: string; address: string; created_at: string }>;
  escalatedMissed: Array<{ id: string; reported_date: string; status: string; address: string; created_at: string }>;
  expiredBids: Array<{ id: string; title: string; scheduled_date: string; status: string; created_at: string }>;
  failedAssignments: Array<{ id: string; location_id: string; failure_reason: string; created_at: string; address: string }>;
  staleDraftRoutes: Array<{ id: string; title: string; scheduled_date: string; created_at: string; order_count: number }>;
  totalExceptions: number;
}

interface ExceptionsDashboardProps {
  onNavigate?: (tab: string) => void;
}

const ExceptionsDashboard: React.FC<ExceptionsDashboardProps> = ({ onNavigate }) => {
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

      {/* Unmatched On-Demand — keep list, add Manage button */}
      {data.unmatchedOnDemand.length > 0 && (
        <Section
          title="Unmatched On-Demand Requests"
          count={data.unmatchedOnDemand.length}
          color="red"
          action={onNavigate ? (
            <button
              onClick={() => onNavigate('on-demand')}
              className="text-xs font-bold text-red-700 hover:text-red-900 underline underline-offset-2"
            >
              Manage →
            </button>
          ) : null}
        >
          {data.unmatchedOnDemand.map(r => (
            <Row key={r.id} primary={r.address} secondary={`${r.service_name} — requested ${formatDate(r.requested_date)}`} meta={`Submitted ${formatTime(r.created_at)}`} />
          ))}
        </Section>
      )}

      {/* Unresolved Missed Collections — collapsed to summary, full list is in Missed Collections tab */}
      {data.escalatedMissed.length > 0 && (
        <SummarySection
          title="Unresolved Missed Collections"
          count={data.escalatedMissed.length}
          color="amber"
          description={`${data.escalatedMissed.length} escalated report${data.escalatedMissed.length !== 1 ? 's' : ''} need resolution`}
          actionLabel="View in Missed Collections →"
          onAction={onNavigate ? () => onNavigate('issues') : undefined}
        />
      )}

      {/* Routes With No Bidders — keep list, add Go to Routes button */}
      {data.expiredBids.length > 0 && (
        <Section
          title="Routes With No Bidders"
          count={data.expiredBids.length}
          color="orange"
          action={onNavigate ? (
            <button
              onClick={() => onNavigate('routes')}
              className="text-xs font-bold text-orange-700 hover:text-orange-900 underline underline-offset-2"
            >
              Go to Routes →
            </button>
          ) : null}
        >
          {data.expiredBids.map(r => (
            <Row key={r.id} primary={r.title} secondary={`Scheduled ${formatDate(r.scheduled_date)}`} meta={`Open since ${formatTime(r.created_at)}`} />
          ))}
        </Section>
      )}

      {/* Failed Auto-Assignments — collapsed to summary, full log is in Contracts tab */}
      {data.failedAssignments.length > 0 && (
        <SummarySection
          title="Failed Auto-Assignments (7 days)"
          count={data.failedAssignments.length}
          color="purple"
          description={`${data.failedAssignments.length} location${data.failedAssignments.length !== 1 ? 's' : ''} could not be auto-assigned`}
          actionLabel="View in Contracts →"
          onAction={onNavigate ? () => onNavigate('contracts') : undefined}
        />
      )}

      {/* Unpublished Draft Routes — keep list, add Go to Routes button */}
      {data.staleDraftRoutes.length > 0 && (
        <Section
          title="Unpublished Drafts (Next 3 Days)"
          count={data.staleDraftRoutes.length}
          color="gray"
          action={onNavigate ? (
            <button
              onClick={() => onNavigate('routes')}
              className="text-xs font-bold text-gray-600 hover:text-gray-800 underline underline-offset-2"
            >
              Go to Routes →
            </button>
          ) : null}
        >
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

const Section: React.FC<{ title: string; count: number; color: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, count, color, action, children }) => (
  <div className={`border rounded-xl overflow-hidden ${COLORS[color] || COLORS.gray}`}>
    <div className="px-4 py-3 flex items-center gap-2">
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white ${BADGE_COLORS[color] || BADGE_COLORS.gray}`}>{count}</span>
      <h3 className="text-sm font-black text-gray-800 flex-1">{title}</h3>
      {action}
    </div>
    <div className="bg-white divide-y divide-gray-100">{children}</div>
  </div>
);

const SummarySection: React.FC<{ title: string; count: number; color: string; description: string; actionLabel: string; onAction?: () => void }> = ({ title, count, color, description, actionLabel, onAction }) => (
  <div className={`border rounded-xl ${COLORS[color] || COLORS.gray}`}>
    <div className="px-4 py-3 flex items-center gap-2">
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black text-white ${BADGE_COLORS[color] || BADGE_COLORS.gray}`}>{count}</span>
      <h3 className="text-sm font-black text-gray-800 flex-1">{title}</h3>
      {onAction && (
        <button onClick={onAction} className={`text-xs font-bold underline underline-offset-2 text-gray-600 hover:text-gray-900`}>
          {actionLabel}
        </button>
      )}
    </div>
    <div className="bg-white px-4 py-2.5">
      <p className="text-sm text-gray-500">{description}</p>
    </div>
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
