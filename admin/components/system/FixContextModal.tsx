import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../../components/Button.tsx';

interface ErrorEntry {
  timestamp?: string;
  source: 'server' | 'client';
  message: string;
  data?: any;
  fixedBy?: string;
}

interface FixContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (adminNotes: string, flaggedErrors: string[]) => void;
  fixing: boolean;
  selectedErrors?: ErrorEntry[];
}

const FixContextModal: React.FC<FixContextModalProps> = ({ isOpen, onClose, onSubmit, fixing, selectedErrors }) => {
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set<number>());
  const [search, setSearch] = useState('');
  const [loadingErrors, setLoadingErrors] = useState(false);

  const isManualMode = selectedErrors && selectedErrors.length > 0;

  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setSelected(new Set<number>());
      setSearch('');

      if (isManualMode) {
        setErrors(selectedErrors);
        setLoadingErrors(false);
      } else {
        setLoadingErrors(true);
        const date = new Date().toISOString().split('T')[0];
        fetch(`/api/admin/logs/errors?date=${date}&limit=200`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : { entries: [] })
          .then(data => setErrors(data.entries ?? []))
          .catch(() => {})
          .finally(() => setLoadingErrors(false));
      }
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return errors.map((e, i) => ({ ...e, _idx: i }));
    const q = search.toLowerCase();
    return errors
      .map((e, i) => ({ ...e, _idx: i }))
      .filter(e =>
        e.message.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q) ||
        (e.data?.url || '').toLowerCase().includes(q) ||
        (e.data?.spa || '').toLowerCase().includes(q)
      );
  }, [errors, search]);

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-black text-gray-900">
            {isManualMode ? `Fix ${errors.length} Selected Error${errors.length !== 1 ? 's' : ''}` : 'Fix Errors'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Selected errors summary (manual mode) */}
          {isManualMode && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                Errors to Fix
              </label>
              <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-100">
                {errors.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          entry.source === 'client' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>{entry.source}</span>
                        {entry.data?.spa && <span className="text-[10px] text-gray-400">{entry.data.spa}</span>}
                      </div>
                      <p className="text-sm text-gray-700 leading-snug truncate">{entry.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Additional Context <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="E.g. 'The sidebar route changed last deploy' or 'API returns 500 when user has no subscriptions'..."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
          </div>

          {/* Error flagging (auto mode only — manual mode already has pre-selected errors) */}
          {!isManualMode && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                Flag Errors <span className="text-gray-400 normal-case tracking-normal">(optional — check errors the platform is having)</span>
              </label>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search errors by message, source, URL, or SPA..."
                className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 mb-2"
              />

              {selected.size > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {Array.from<number>(selected).map(idx => {
                    const e = errors[idx];
                    if (!e) return null;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggle(idx)}
                        className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg px-2 py-0.5 text-xs font-bold hover:bg-teal-100 max-w-xs truncate"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.source === 'client' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                        <span className="truncate">{e.message.slice(0, 60)}</span>
                        <span className="text-teal-400 flex-shrink-0">&times;</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="border border-gray-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-gray-100">
                {loadingErrors ? (
                  <div className="p-4 text-center text-sm text-gray-400">Loading errors...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-400">
                    {search ? 'No errors match your search' : 'No errors found for today'}
                  </div>
                ) : (
                  filtered.map(entry => (
                    <label
                      key={entry._idx}
                      className={`flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${selected.has(entry._idx) ? 'bg-teal-50/50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(entry._idx)}
                        onChange={() => toggle(entry._idx)}
                        className="mt-1 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            entry.source === 'client' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          }`}>{entry.source}</span>
                          {entry.fixedBy && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                              Fixed <span className="font-mono">{entry.fixedBy}</span>
                            </span>
                          )}
                          {entry.data?.spa && <span className="text-[10px] text-gray-400">{entry.data.spa}</span>}
                        </div>
                        <p className="text-sm text-gray-700 leading-snug truncate">{entry.message}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          {isManualMode ? (
            <button
              type="button"
              onClick={onClose}
              disabled={fixing}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSubmit('', [])}
              disabled={fixing}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Skip &mdash; fix without context
            </button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (isManualMode) {
                onSubmit(notes.trim(), []);
              } else {
                const flagged = Array.from(selected).map(idx => {
                  const e = errors[idx];
                  if (!e) return '';
                  let line = `[${e.source}] ${e.message}`;
                  if (e.data?.url) line += ` (URL: ${e.data.url})`;
                  if (e.data?.spa) line += ` (SPA: ${e.data.spa})`;
                  return line;
                }).filter(Boolean);
                onSubmit(notes.trim(), flagged);
              }
            }}
            disabled={fixing}
          >
            {fixing ? (
              <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Fixing...</>
            ) : isManualMode ? (
              `Fix ${errors.length} Error${errors.length !== 1 ? 's' : ''}`
            ) : (
              'Fix All Errors'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FixContextModal;
