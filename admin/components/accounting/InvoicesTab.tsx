import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState } from '../ui/index.ts';
import type { InvoiceItem } from './types.ts';
import { formatCurrency, formatDateTime, formatDate } from './types.ts';
import type { NavFilter } from '../../../shared/types/index.ts';

type DateRange = '30d' | '90d' | 'year' | 'all';

const getDateRange = (range: DateRange): { startDate?: string; endDate?: string } => {
  if (range === 'all') return {};
  const now = new Date();
  const end = now.toISOString();
  const start = new Date(now);
  if (range === '30d') start.setDate(start.getDate() - 30);
  else if (range === '90d') start.setDate(start.getDate() - 90);
  else if (range === 'year') start.setMonth(0, 1);
  return { startDate: start.toISOString(), endDate: end };
};

const InvoicesTab: React.FC<{ navFilter?: NavFilter | null; onFilterConsumed?: () => void }> = ({ navFilter, onFilterConsumed }) => {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const limit = 50;

  useEffect(() => {
    if (navFilter?.filter) {
      setStatusFilter(navFilter.filter);
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getDateRange(dateRange);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('page', String(Math.floor(offset / limit) + 1));
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/admin/accounting/invoices?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch invoices');
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading invoices');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [offset, dateRange, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statusOptions = ['all', 'open', 'paid', 'void', 'draft', 'uncollectible'];
  const dateRanges: { key: DateRange; label: string }[] = [
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
    { key: 'year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase mr-1">Status:</span>
            {statusOptions.map(opt => (
              <button
                key={opt}
                onClick={() => { setStatusFilter(opt); setOffset(0); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  statusFilter === opt
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase mr-1">Period:</span>
            {dateRanges.map(r => (
              <button
                key={r.key}
                onClick={() => { setDateRange(r.key); setOffset(0); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  dateRange === r.key
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Summary */}
      {!loading && !error && (
        <Card className="p-4">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Invoices</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{total}</p>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <Card className="p-6"><div className="text-red-600 text-sm">{error}</div></Card>
      ) : items.length === 0 ? (
        <EmptyState message="No invoices found." />
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Invoice #</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Customer</th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden sm:table-cell">Due Date</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(item.created)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{item.number || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">{item.customerName}</div>
                        <div className="text-xs text-gray-500">{item.customerEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3 text-sm"><StatusBadge status={item.status} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{formatDate(item.dueDate)}</td>
                      <td className="px-4 py-3 text-sm">
                        {item.hostedInvoiceUrl ? (
                          <a href={item.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline text-xs font-semibold">View</a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {total > limit && (
            <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
          )}
        </>
      )}
    </div>
  );
};

export default InvoicesTab;
