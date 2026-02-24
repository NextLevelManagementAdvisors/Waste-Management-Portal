import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import ActivityDetailModal from './ActivityDetailModal.tsx';

interface LogEntry {
  id: string;
  recipient_name: string | null;
  recipient_contact: string | null;
  recipient_type: string | null;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  error_message: string | null;
  sent_by_first: string | null;
  sent_by_last: string | null;
  created_at: string;
}

const ActivityLogTab: React.FC = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
  const limit = 25;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/admin/activity-log?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [page, channelFilter, statusFilter, search]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [channelFilter, statusFilter, search]);

  const totalPages = Math.ceil(total / limit);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'sent': return 'bg-green-100 text-green-700';
      case 'failed': return 'bg-red-100 text-red-700';
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'cancelled': return 'bg-gray-100 text-gray-500';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const channelColor = (ch: string) => {
    switch (ch) {
      case 'email': return 'bg-blue-100 text-blue-700';
      case 'sms': return 'bg-green-100 text-green-700';
      case 'in_app': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by recipient..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20">
            <option value="all">All Channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="in_app">In-App</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20">
            <option value="all">All Statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <span className="text-sm text-gray-400">{total} entr{total !== 1 ? 'ies' : 'y'}</span>

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No Activity"
          message="Messages you send will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-black uppercase text-gray-500">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase text-gray-500">Recipient</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase text-gray-500">Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase text-gray-500 hidden sm:table-cell">Subject</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase text-gray-500 hidden md:table-cell">Sent By</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(entry.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-gray-900 truncate max-w-[200px]">{entry.recipient_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{entry.recipient_contact}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${channelColor(entry.channel)}`}>
                        {entry.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-[250px] hidden sm:table-cell">{entry.subject || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${statusColor(entry.status)}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                      {entry.sent_by_first ? `${entry.sent_by_first} ${entry.sent_by_last}` : 'System'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 text-sm font-bold rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Previous
                </button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 text-sm font-bold rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  Next
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {selectedEntry && (
        <ActivityDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
};

export default ActivityLogTab;
