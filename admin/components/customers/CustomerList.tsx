import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { MagnifyingGlassIcon, ArrowRightIcon } from '../../../components/Icons.tsx';
import { LoadingSpinner, Pagination, EmptyState, FilterBar } from '../ui/index.ts';
import type { CustomerListItem, NavFilter } from '../../../shared/types/index.ts';
import BulkNotifyDialog from './BulkNotifyDialog.tsx';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

interface CustomerListProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  onSelectCustomer: (id: string) => void;
}

const CustomerList: React.FC<CustomerListProps> = ({ navFilter, onFilterConsumed, onSelectCustomer }) => {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [stripeFilter, setStripeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkNotify, setShowBulkNotify] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  useEffect(() => {
    if (navFilter) {
      if (navFilter.sort) setSortBy(navFilter.sort);
      if (navFilter.filter) setServiceFilter(navFilter.filter);
      if (navFilter.search) setSearchQuery(navFilter.search);
      setOffset(0);
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (serviceFilter !== 'all') params.set('serviceType', serviceFilter);
    if (stripeFilter === 'linked') params.set('hasStripe', 'yes');
    else if (stripeFilter === 'not_linked') params.set('hasStripe', 'no');
    const sortMap: Record<string, { sortBy: string; sortDir: string }> = {
      newest:    { sortBy: 'created_at', sortDir: 'desc' },
      oldest:    { sortBy: 'created_at', sortDir: 'asc' },
      name_asc:  { sortBy: 'name',       sortDir: 'asc' },
      name_desc: { sortBy: 'name',       sortDir: 'desc' },
    };
    const s = sortMap[sortBy];
    if (s) { params.set('sortBy', s.sortBy); params.set('sortDir', s.sortDir); }
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
  }, [searchQuery, serviceFilter, stripeFilter, sortBy, limit, offset]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildQueryString();
      const res = await fetch(`/api/admin/customers?${qs}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.customers) {
          setCustomers(data.customers);
          setTotal(data.total || data.customers.length);
        } else if (Array.isArray(data)) {
          setCustomers(data);
          setTotal(data.length);
        }
      }
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      setLoading(false);
    }
  }, [buildQueryString]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (serviceFilter !== 'all') params.set('serviceType', serviceFilter);
    if (stripeFilter === 'linked') params.set('hasStripe', 'yes');
    else if (stripeFilter === 'not_linked') params.set('hasStripe', 'no');
    window.open(`/api/admin/export/customers?${params.toString()}`, '_blank');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map(c => c.id)));
    }
  };

  const handleBulkNotify = async (channel: string, message: string) => {
    setBulkSending(true);
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          channel,
          message,
          userIds: Array.from(selectedIds),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowBulkNotify(false);
        setSelectedIds(new Set());
        if (data.failed > 0) {
          alert(`Sent ${data.sent} notification(s), ${data.failed} failed.`);
        }
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to send notifications');
      }
    } catch {
      alert('Failed to send notifications');
    } finally {
      setBulkSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
        <Button variant="secondary" size="sm" onClick={handleExportCSV}>
          Export CSV
        </Button>
      </div>

      <FilterBar>
        <div className="flex flex-wrap gap-3 items-center w-full">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Service Type</label>
            <select
              value={serviceFilter}
              onChange={e => { setServiceFilter(e.target.value); setOffset(0); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All</option>
              <option value="personal">Personal</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Stripe Status</label>
            <select
              value={stripeFilter}
              onChange={e => { setStripeFilter(e.target.value); setOffset(0); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="all">All</option>
              <option value="linked">Linked</option>
              <option value="not_linked">Not Linked</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setOffset(0); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
            </select>
          </div>
          {selectedIds.size > 0 && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => setShowBulkNotify(true)}>
                Notify ({selectedIds.size})
              </Button>
              <Button variant="secondary" size="sm" onClick={async () => {
                if (!confirm(`Grant admin access to ${selectedIds.size} selected user(s)?`)) return;
                try {
                  const res = await fetch('/api/admin/customers/bulk-action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ action: 'grant_admin', userIds: Array.from(selectedIds) }),
                  });
                  if (res.ok) { setSelectedIds(new Set()); loadCustomers(); }
                  else { const j = await res.json(); alert(j.error || 'Failed'); }
                } catch { alert('Failed to execute action'); }
              }}>
                Grant Admin
              </Button>
              <Button variant="secondary" size="sm" onClick={async () => {
                if (!confirm(`Revoke admin access from ${selectedIds.size} selected user(s)?`)) return;
                try {
                  const res = await fetch('/api/admin/customers/bulk-action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ action: 'revoke_admin', userIds: Array.from(selectedIds) }),
                  });
                  if (res.ok) { setSelectedIds(new Set()); loadCustomers(); }
                  else { const j = await res.json(); alert(j.error || 'Failed'); }
                } catch { alert('Failed to execute action'); }
              }}>
                Revoke Admin
              </Button>
            </div>
          )}
        </div>
      </FilterBar>

      {loading ? <LoadingSpinner /> : customers.length === 0 ? (
        <EmptyState message="No customers found matching your criteria." />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === customers.length && customers.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden md:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden lg:table-cell">Properties</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Stripe</th>
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400 hidden lg:table-cell">Joined</th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {customers.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">{c.name}</p>
                        {c.isAdmin && <span className="text-[9px] font-black uppercase tracking-widest text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded-full">Admin</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{c.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{c.phone || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{c.propertyCount ?? 0}</td>
                      <td className="px-4 py-3">
                        {c.stripeCustomerId ? (
                          <span className="text-[9px] font-black uppercase tracking-widest text-green-700 bg-green-100 px-2 py-1 rounded-full">Linked</span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-1 rounded-full">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">{formatDate(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => onSelectCustomer(c.id)}>
                          <span className="flex items-center gap-1">View <ArrowRightIcon className="w-3 h-3" /></span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {total > limit && (
            <Pagination
              total={total}
              limit={limit}
              offset={offset}
              onChange={setOffset}
            />
          )}
        </>
      )}

      <BulkNotifyDialog
        isOpen={showBulkNotify}
        selectedCount={selectedIds.size}
        onClose={() => setShowBulkNotify(false)}
        onSend={handleBulkNotify}
        isSending={bulkSending}
      />
    </div>
  );
};

export default CustomerList;
