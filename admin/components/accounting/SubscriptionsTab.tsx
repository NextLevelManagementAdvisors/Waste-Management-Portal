import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { MagnifyingGlassIcon } from '../../../components/Icons.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState } from '../ui/index.ts';
import type { SubscriptionListItem } from './types.ts';
import { formatCurrency, formatDate } from './types.ts';

type StatusFilter = 'active' | 'past_due' | 'canceled' | 'all';

const SubscriptionsTab: React.FC = () => {
  const [items, setItems] = useState<SubscriptionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalMrr, setTotalMrr] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('page', String(Math.floor(offset / limit) + 1));
      params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/accounting/subscriptions?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch subscriptions');
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setTotalMrr(data.totalMrr);
      setActiveCount(data.activeCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading subscriptions');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = (status: StatusFilter) => {
    setStatusFilter(status);
    setOffset(0);
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setOffset(0);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'past_due', label: 'Past Due' },
    { key: 'canceled', label: 'Canceled' },
    { key: 'all', label: 'All' },
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
                key={opt.key}
                onClick={() => handleStatusChange(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  statusFilter === opt.key
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg bg-white">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customer..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Search
            </button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Active Subscriptions</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{activeCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Monthly Recurring</p>
            <p className="text-2xl font-black text-green-700 mt-1">{formatCurrency(totalMrr)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Showing</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{total}</p>
          </Card>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <Card className="p-6"><div className="text-red-600 text-sm">{error}</div></Card>
      ) : items.length === 0 ? (
        <EmptyState message="No subscriptions found." />
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Plan</th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">MRR</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden sm:table-cell">Period End</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden sm:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-gray-900">{item.customerName}</div>
                        <div className="text-xs text-gray-500">{item.customerEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {item.items.length > 0
                          ? item.items.map((si, idx) => (
                              <div key={idx}>
                                {si.productName}
                                {si.quantity > 1 ? ` x${si.quantity}` : ''}
                                {si.interval ? ` / ${si.interval}` : ''}
                              </div>
                            ))
                          : <span className="text-gray-400">-</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                        {formatCurrency(item.mrr)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusBadge status={item.status} />
                        {item.cancelAtPeriodEnd && (
                          <div className="text-[10px] text-orange-600 font-semibold mt-0.5">Cancels at period end</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                        {formatDate(item.currentPeriodEnd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                        {formatDate(item.created)}
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

export default SubscriptionsTab;
