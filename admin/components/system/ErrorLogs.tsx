import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, EmptyState, FilterBar } from '../ui/index.ts';
import FixContextModal from './FixContextModal.tsx';

interface ErrorLogEntry {
  timestamp: string;
  level: string;
  source: 'server' | 'client';
  message: string;
  data?: any;
  stack?: string;
  fixedBy?: string;
}

interface FixResult {
  success: boolean;
  errorsFound: number;
  uniqueErrors: number;
  committed: boolean;
  commitHash?: string;
  message: string;
  errorSummaries?: string[];
}

interface FixProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  messages: string[];
  result: FixResult | null;
}

function normalizeErrorKey(source: string, message: string): string {
  let msg = message;
  if (source === 'server') {
    msg = msg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>');
    msg = msg.replace(/\b(in|pi|pm|sub|cus|ch|cs|si|seti|price|prod)_[A-Za-z0-9]+/g, '<STRIPE_ID>');
    msg = msg.replace(/\?[^ ]*/, '');
    msg = msg.replace(/\s+\d+ms$/, '');
  }
  return `${source}::${msg}`;
}

const formatTime = (ts: string) => {
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
};

const SourceBadge: React.FC<{ source: string }> = ({ source }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
    source === 'client'
      ? 'bg-orange-100 text-orange-700'
      : 'bg-blue-100 text-blue-700'
  }`}>
    {source}
  </span>
);

const ErrorLogs: React.FC = () => {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [dates, setDates] = useState<string[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Fix state
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [fixMessages, setFixMessages] = useState<string[]>([]);
  const progressRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    fetch('/api/admin/logs/dates', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { dates: [] })
      .then(data => {
        const d = data.dates ?? [];
        setDates(d);
        if (d.length > 0 && !d.includes(dateFilter)) {
          setDateFilter(d[0]);
        }
      })
      .catch(() => {});
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpandedIndex(null);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({ date: dateFilter, limit: '200' });
      if (sourceFilter) params.append('source', sourceFilter);
      const res = await fetch(`/api/admin/logs/errors?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch error logs');
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching logs');
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, sourceFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Restore fix progress on mount
  useEffect(() => {
    fetch('/api/admin/fix-progress', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((progress: FixProgress | null) => {
        if (!progress || progress.status === 'idle') return;
        setFixMessages(progress.messages);
        if (progress.status === 'running') {
          setFixing(true);
          startPolling();
        } else {
          setFixResult(progress.result);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-scroll progress log
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [fixMessages]);

  const startPolling = useCallback(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/admin/fix-progress', { credentials: 'include' });
        if (!r.ok) return;
        const p: FixProgress = await r.json();
        setFixMessages(p.messages);
        if (p.status === 'done' || p.status === 'error') {
          setFixResult(p.result);
          setFixing(false);
          if (p.result?.success) fetchEntries();
          return;
        }
        setTimeout(poll, 2000);
      } catch {
        setTimeout(poll, 3000);
      }
    };
    setTimeout(poll, 1000);
  }, [fetchEntries]);

  const toggleSelect = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((_, i) => i)));
    }
  };

  const selectedEntries = Array.from(selected).map(i => entries[i]).filter(Boolean);
  const unfixedSelected = selectedEntries.filter(e => !e.fixedBy);

  const handleCopySelected = () => {
    const text = selectedEntries.map(e => {
      let line = `[${e.source}] ${e.message}`;
      if (e.data?.url) line += `\n  URL: ${e.data.url}`;
      if (e.data?.spa) line += `\n  SPA: ${e.data.spa}`;
      if (e.stack) line += `\n  Stack: ${e.stack.split('\n').slice(0, 3).join('\n    ')}`;
      return line;
    }).join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleFixSubmit = async (adminNotes: string, flaggedErrors: string[]) => {
    setShowFixModal(false);
    setFixing(true);
    setFixResult(null);
    setFixMessages([]);

    // Compute unique error keys from selected entries
    const errorKeys = [...new Set(
      unfixedSelected.map(e => normalizeErrorKey(e.source, e.message))
    )];

    try {
      const res = await fetch('/api/admin/fix-errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateFilter,
          errorKeys,
          adminNotes: adminNotes || undefined,
          flaggedStories: flaggedErrors.length > 0 ? flaggedErrors : undefined,
        }),
      });
      const data = await res.json();
      if (!data.started) {
        setFixResult({ success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: data.error || data.message || 'Failed to start fix' });
        setFixing(false);
        return;
      }
      startPolling();
    } catch {
      setFixResult({ success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: 'Request failed' });
      setFixing(false);
    }
  };

  return (
    <div className="space-y-4">
      <FilterBar className="bg-white">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">Source</label>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
          >
            <option value="">All Sources</option>
            <option value="client">Client</option>
            <option value="server">Server</option>
          </select>
        </div>
        <div className="flex items-end gap-3">
          <span className="text-xs text-gray-500 pb-2">{total} error{total !== 1 ? 's' : ''} on this date</span>
          {entries.length > 0 && (() => {
            const fixedCount = entries.filter(e => e.fixedBy).length;
            const openCount = entries.length - fixedCount;
            return (
              <>
                {fixedCount > 0 && <span className="text-xs font-bold text-green-600 pb-2">{fixedCount} fixed</span>}
                {openCount > 0 && <span className="text-xs font-bold text-red-500 pb-2">{openCount} open</span>}
              </>
            );
          })()}
        </div>
        {selected.size > 0 && (
          <div className="flex items-end gap-2 ml-auto">
            <span className="text-xs font-bold text-teal-600 pb-2">{selected.size} selected</span>
            {unfixedSelected.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowFixModal(true)}
                disabled={fixing}
              >
                {fixing ? (
                  <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />Fixing...</>
                ) : (
                  `Fix ${unfixedSelected.length} Error${unfixedSelected.length !== 1 ? 's' : ''}`
                )}
              </Button>
            )}
            <button
              type="button"
              onClick={handleCopySelected}
              className="px-3 py-2 rounded-lg text-xs font-bold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-3 py-2 rounded-lg text-xs font-bold border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </FilterBar>

      {/* Fix progress console */}
      {(fixing || fixMessages.length > 0) && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-900 flex items-center gap-2">
            {fixing && <span className="inline-block w-3 h-3 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />}
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-300">
              {fixing ? 'Fixing Errors...' : 'Fix Complete'}
            </h3>
            {!fixing && (
              <button
                type="button"
                onClick={() => setFixMessages([])}
                className="ml-auto text-gray-500 hover:text-gray-300 text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>
          <pre
            ref={progressRef}
            className="px-4 py-3 bg-gray-950 text-gray-300 text-xs font-mono leading-relaxed max-h-72 overflow-y-auto whitespace-pre-wrap"
          >
            {fixMessages.map((msg, i) => {
              const isToolAction = /^(Reading|Editing|Writing|Searching|Running|Using) /.test(msg);
              const isError = /^\d+x /.test(msg);
              return (
                <div key={i} className={`py-0.5 ${isToolAction ? 'text-teal-400' : isError ? 'text-yellow-400' : ''}`}>
                  {isToolAction && <span className="text-gray-600 mr-1">&gt;</span>}
                  {msg}
                </div>
              );
            })}
            {fixing && fixMessages.length === 0 && (
              <div className="text-gray-500 py-0.5">Starting...</div>
            )}
            {fixing && <span className="inline-block w-1.5 h-3.5 bg-teal-400 animate-pulse ml-0.5" />}
          </pre>
        </Card>
      )}

      {/* Fix result banner */}
      {fixResult && (
        <div className={`rounded-lg text-sm border ${
          fixResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center justify-between p-4">
            <span className="font-bold">{fixResult.message}</span>
            <button type="button" onClick={() => setFixResult(null)} className="text-xs font-bold opacity-50 hover:opacity-100">&times;</button>
          </div>
          {fixResult.errorSummaries && fixResult.errorSummaries.length > 0 && (
            <div className="px-4 pb-4">
              <div className="text-xs font-bold opacity-60 mb-1">Errors addressed:</div>
              <ul className="space-y-0.5">
                {fixResult.errorSummaries.map((s, i) => (
                  <li key={i} className="text-xs opacity-80">&bull; {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{error}</div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : entries.length === 0 ? (
        <EmptyState title="No Errors" message="No error logs found for this date." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-3 w-10">
                    <label className="sr-only">Select all</label>
                    <input
                      type="checkbox"
                      checked={selected.size === entries.length && entries.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Message</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map((entry, i) => (
                  <React.Fragment key={i}>
                    <tr
                      className={`transition-colors cursor-pointer ${selected.has(i) ? 'bg-teal-50/50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap" onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}>
                        {formatTime(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3" onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}>
                        <SourceBadge source={entry.source} />
                      </td>
                      <td className="px-4 py-3" onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}>
                        {entry.fixedBy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            Fixed
                            <span className="font-mono text-green-600">{entry.fixedBy}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-500">
                            Open
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate" title={entry.message} onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}>
                        {entry.message}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate" onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}>
                        {entry.data?.context || entry.data?.url || '—'}
                      </td>
                    </tr>
                    {expandedIndex === i && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 bg-gray-50">
                          <div className="space-y-3">
                            {entry.data && (
                              <div>
                                <div className="text-xs font-bold text-gray-500 mb-1">Details</div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(entry.data).filter(([, v]) => v != null).map(([k, v]) => (
                                    <span key={k} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-md px-2 py-0.5 text-xs">
                                      <span className="text-gray-400 font-medium">{k}:</span>
                                      <span className="font-semibold truncate max-w-[200px]" title={String(v)}>{String(v)}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {entry.stack && (
                              <div>
                                <div className="text-xs font-bold text-gray-500 mb-1">Stack Trace</div>
                                <pre className="text-xs text-gray-700 bg-gray-100 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">{entry.stack}</pre>
                              </div>
                            )}
                            {!entry.stack && !entry.data && (
                              <div className="text-sm text-gray-400">No additional details available.</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <FixContextModal
        isOpen={showFixModal}
        onClose={() => setShowFixModal(false)}
        onSubmit={handleFixSubmit}
        fixing={fixing}
        selectedErrors={unfixedSelected}
      />
    </div>
  );
};

export default ErrorLogs;
