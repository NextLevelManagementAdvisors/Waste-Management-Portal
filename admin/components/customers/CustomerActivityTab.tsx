import React, { useState, useEffect } from 'react';
import type { AuditLogEntry } from '../../../shared/types/index.ts';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const CustomerActivityTab: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/audit-log?entityId=${customerId}&limit=20`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setLogs(data.logs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="py-4 text-center text-gray-400 text-sm">Loading activity...</div>;

  if (logs.length === 0) return <p className="text-sm text-gray-400 text-center py-6">No activity recorded for this customer</p>;

  return (
    <div className="space-y-3">
      {logs.map(log => (
        <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-xs font-black text-teal-700">{log.adminName.split(' ').map(n => n[0]).join('')}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{log.adminName}</span>
              <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{log.action.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.createdAt)}</p>
            {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(log.details).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-[10px]">
                    <span className="text-gray-400">{k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}:</span>
                    <span className="font-semibold">{String(v).substring(0, 40)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CustomerActivityTab;
