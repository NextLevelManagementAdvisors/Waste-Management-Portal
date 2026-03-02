import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import FixContextModal from './FixContextModal.tsx';

interface FileChange {
  status: string;
  path: string;
}

interface FixCommit {
  hash: string;
  date: string;
  message: string;
  errors?: string[];
  files?: FileChange[];
}

interface AutoFixStatus {
  enabled: boolean;
  running: boolean;
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

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    modified: 'bg-amber-100 text-amber-700',
    added: 'bg-green-100 text-green-700',
    deleted: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
};

const AutoFixHistory: React.FC = () => {
  const [commits, setCommits] = useState<FixCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [status, setStatus] = useState<AutoFixStatus>({ enabled: false, running: false });
  const [togglingAutoFix, setTogglingAutoFix] = useState(false);

  // Manual fix state
  const [showFixModal, setShowFixModal] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [fixMessages, setFixMessages] = useState<string[]>([]);
  const progressRef = useRef<HTMLPreElement>(null);

  const fetchCommits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/fix-history?detailed=true&limit=30', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCommits(data.commits ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/auto-fix/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchCommits();
    fetchStatus();

    // Restore fix progress if a fix is running or just finished
    fetch('/api/admin/fix-progress', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((progress: FixProgress | null) => {
        if (!progress || progress.status === 'idle') return;
        setFixMessages(progress.messages);
        if (progress.status === 'running') {
          setFixing(true);
          const poll = async () => {
            try {
              const r = await fetch('/api/admin/fix-progress', { credentials: 'include' });
              if (!r.ok) return;
              const p: FixProgress = await r.json();
              setFixMessages(p.messages);
              if (p.status === 'done' || p.status === 'error') {
                setFixResult(p.result);
                setFixing(false);
                if (p.result?.success) fetchCommits();
                return;
              }
              setTimeout(poll, 2000);
            } catch {
              setTimeout(poll, 3000);
            }
          };
          setTimeout(poll, 2000);
        } else {
          setFixResult(progress.result);
        }
      })
      .catch(() => {});
  }, [fetchCommits, fetchStatus]);

  // Auto-scroll progress log
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [fixMessages]);

  const handleToggle = async () => {
    setTogglingAutoFix(true);
    try {
      const res = await fetch('/api/admin/auto-fix/toggle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(s => ({ ...s, enabled: data.enabled }));
      }
    } catch { /* ignore */ } finally {
      setTogglingAutoFix(false);
    }
  };

  const handleFixErrors = async (adminNotes: string, flaggedStories: string[]) => {
    setShowFixModal(false);
    setFixing(true);
    setFixResult(null);
    setFixMessages([]);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/admin/fix-errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          adminNotes: adminNotes || undefined,
          flaggedStories: flaggedStories.length > 0 ? flaggedStories : undefined,
        }),
      });
      const data = await res.json();
      if (!data.started) {
        setFixResult({ success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: data.error || data.message || 'Failed to start fix' });
        setFixing(false);
        return;
      }

      const poll = async () => {
        try {
          const r = await fetch('/api/admin/fix-progress', { credentials: 'include' });
          if (!r.ok) return;
          const progress: FixProgress = await r.json();
          setFixMessages(progress.messages);
          if (progress.status === 'done' || progress.status === 'error') {
            setFixResult(progress.result);
            setFixing(false);
            if (progress.result?.success) fetchCommits();
            return;
          }
          setTimeout(poll, 2000);
        } catch {
          setTimeout(poll, 3000);
        }
      };
      setTimeout(poll, 1000);
    } catch {
      setFixResult({ success: false, errorsFound: 0, uniqueErrors: 0, committed: false, message: 'Request failed' });
      setFixing(false);
    }
  };

  // Count stats
  const totalFixes = commits.length;
  const totalErrors = commits.reduce((sum, c) => sum + (c.errors?.length || 0), 0);
  const totalFiles = commits.reduce((sum, c) => sum + (c.files?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Status + actions bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${status.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
              <span className="text-sm font-bold text-gray-900">
                Auto-Fix is {status.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {(status.running || fixing) && (
              <span className="flex items-center gap-1.5 text-xs text-teal-600 font-bold">
                <span className="inline-block w-3 h-3 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
                Fix in progress...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalFixes > 0 && (
              <div className="flex items-center gap-4 text-xs text-gray-500 mr-2">
                <span><strong className="text-gray-700">{totalFixes}</strong> runs</span>
                <span><strong className="text-gray-700">{totalErrors}</strong> errors</span>
                <span><strong className="text-gray-700">{totalFiles}</strong> files</span>
              </div>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowFixModal(true)}
              disabled={fixing}
              className="whitespace-nowrap"
            >
              {fixing ? (
                <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Fixing...</>
              ) : (
                'Fix Errors Now'
              )}
            </Button>
            <Button
              variant={status.enabled ? 'secondary' : 'ghost'}
              size="sm"
              onClick={handleToggle}
              disabled={togglingAutoFix}
            >
              {status.enabled ? 'Disable Auto' : 'Enable Auto'}
            </Button>
          </div>
        </div>
        {status.enabled && (
          <p className="text-xs text-gray-400 mt-2">
            Errors are automatically fixed when reported (2-min debounce, 15-min cooldown) with a 1-hour periodic fallback.
          </p>
        )}
      </Card>

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

      {/* Commit history */}
      {loading ? (
        <LoadingSpinner />
      ) : commits.length === 0 ? (
        <EmptyState title="No Auto-Fixes Yet" message="Auto-fix commits will appear here when errors are automatically fixed." />
      ) : (
        <div className="space-y-3">
          {commits.map(commit => {
            const isExpanded = expandedHash === commit.hash;
            return (
              <Card key={commit.hash} className="p-0 overflow-hidden">
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedHash(isExpanded ? null : commit.hash)}
                >
                  <div className="flex items-start gap-3">
                    <code className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded mt-0.5 shrink-0 font-mono">
                      {commit.hash}
                    </code>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{commit.message}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400">{formatDate(commit.date)}</span>
                        {commit.errors?.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {commit.errors.length} error{commit.errors.length !== 1 ? 's' : ''} fixed
                          </span>
                        )}
                        {commit.files && commit.files.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {commit.files.length} file{commit.files.length !== 1 ? 's' : ''} changed
                          </span>
                        )}
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform shrink-0 mt-1 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    {commit.errors?.length > 0 && (
                      <div className="px-4 py-3 border-b border-gray-100">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Errors Fixed</h4>
                        <ul className="space-y-1">
                          {commit.errors.map((err, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <svg className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                              <span className="text-xs text-gray-700">{err}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {commit.files && commit.files.length > 0 && (
                      <div className="px-4 py-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Files Changed</h4>
                        <div className="space-y-1">
                          {commit.files.map((file, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <StatusBadge status={file.status} />
                              <span className="text-xs text-gray-700 font-mono truncate">{file.path}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!commit.errors?.length && !commit.files?.length && (
                      <div className="px-4 py-3 text-xs text-gray-400">No additional details available.</div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <FixContextModal
        isOpen={showFixModal}
        onClose={() => setShowFixModal(false)}
        onSubmit={handleFixErrors}
        fixing={fixing}
      />
    </div>
  );
};

export default AutoFixHistory;
