import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, Pagination, EmptyState, FilterBar } from '../ui/index.ts';
import type { AuditLogEntry, AuditLogResponse } from '../../../shared/types/index.ts';

const AUDIT_LIMIT = 50;

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const parseDetails = (details: any): Record<string, any> | null => {
  if (!details) return null;
  if (typeof details === 'object') return details;
  try { return JSON.parse(details); } catch { return null; }
};

const DetailsPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-md px-2 py-0.5 text-xs mr-1 mb-1">
    <span className="text-gray-400 font-medium">{label}:</span>
    <span className="font-semibold truncate max-w-[140px]" title={value}>{value}</span>
  </span>
);

const DetailsCell: React.FC<{ details: any }> = ({ details }) => {
  const parsed = parseDetails(details);
  if (!parsed || Object.keys(parsed).length === 0) return <span className="text-gray-300">&mdash;</span>;

  const formatKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
  const formatValue = (v: any): string => {
    if (v === null || v === undefined) return '\u2014';
    if (typeof v === 'number') return v.toLocaleString();
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="flex flex-wrap max-w-xs">
      {Object.entries(parsed).map(([key, val]) => (
        <DetailsPill key={key} label={formatKey(key)} value={formatValue(val)} />
      ))}
    </div>
  );
};

const AuditLog: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState('');

  const fetchAuditLogs = async (offset: number, action?: string, entityType?: string) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const params = new URLSearchParams({ limit: AUDIT_LIMIT.toString(), offset: offset.toString() });
      if (action) params.append('action', action);
      if (entityType) params.append('entityType', entityType);

      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      const data: AuditLogResponse = await res.json();
      setAuditLogs(data.logs);
      setAuditTotal(data.total);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Error fetching audit logs');
      setAuditLogs([]);
      setAuditTotal(0);
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs(0);
  }, []);

  const handleApplyFilters = () => {
    setAuditOffset(0);
    fetchAuditLogs(0, auditActionFilter, auditEntityTypeFilter);
  };

  return (
    <div className="space-y-4">
      <FilterBar className="bg-white">
        <input
          type="text"
          placeholder="Filter by action..."
          value={auditActionFilter}
          onChange={e => setAuditActionFilter(e.target.value)}
          onKeyPress={e => { if (e.key === 'Enter') handleApplyFilters(); }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <select
          value={auditEntityTypeFilter}
          onChange={e => { setAuditEntityTypeFilter(e.target.value); setAuditOffset(0); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        >
          <option value="">All Entity Types</option>
          <option value="user">User</option>
          <option value="system">System</option>
          <option value="missed_pickup">Missed Pickup</option>
        </select>
        <Button size="sm" onClick={handleApplyFilters}>Apply Filters</Button>
      </FilterBar>

      {auditError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{auditError}</div>
      )}

      {auditLoading ? (
        <LoadingSpinner />
      ) : auditLogs.length === 0 ? (
        <EmptyState message="No audit logs found" />
      ) : (
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Admin</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Entity Type</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Entity ID</th>
                    <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-900">{formatDate(log.createdAt)}</td>
                      <td className="px-6 py-3 text-sm">
                        <div className="text-gray-900 font-medium">{log.adminName}</div>
                        <div className="text-xs text-gray-500">{log.adminEmail}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-900 font-medium">{log.action}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{log.entityType}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{log.entityId}</td>
                      <td className="px-6 py-3"><DetailsCell details={log.details} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            total={auditTotal}
            limit={AUDIT_LIMIT}
            offset={auditOffset}
            onChange={newOffset => {
              setAuditOffset(newOffset);
              fetchAuditLogs(newOffset, auditActionFilter, auditEntityTypeFilter);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default AuditLog;
