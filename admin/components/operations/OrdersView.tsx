import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner } from '../ui/index.ts';
import RouteOptimizerModal from './RouteOptimizerModal.tsx';

interface Order {
  id?: string;
  orderNo: string;
  date: string;
  type?: string;
  duration?: number;
  priority?: string;
  location?: {
    address?: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
  };
  timeWindows?: { twFrom: string; twTo: string }[];
  assignedTo?: { externalId?: string; serial?: string };
  notes?: string;
}

const TYPE_LABELS: Record<string, string> = { D: 'Delivery', P: 'Pickup', T: 'Task' };
const PRIORITY_LABELS: Record<string, string> = { L: 'Low', M: 'Medium', H: 'High', C: 'Critical' };

const OrdersView: React.FC = () => {
  const today = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [detailOrder, setDetailOrder] = useState<{ order: any; schedule: any; completion: any } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);

  const searchOrders = useCallback(async () => {
    setError('');
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/optimoroute/orders?from=${fromDate}&to=${toDate}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.error('Failed to search orders:', e);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { searchOrders(); }, []); // auto-search on mount

  const getOrderKey = (order: Order) => order.orderNo || order.id || '';

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const key = getOrderKey(deleteTarget);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/optimoroute/orders/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setOrders(prev => prev.filter(o => getOrderKey(o) !== key));
        setDeleteTarget(null);
      } else {
        setError('Failed to delete order');
      }
    } catch {
      setError('Failed to delete order — network error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectOrder = (key: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(getOrderKey)));
    }
  };

  const bulkDelete = async () => {
    if (selectedOrders.size === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/admin/optimoroute/orders/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderNos: Array.from(selectedOrders), forceDelete: true }),
      });
      if (res.ok) {
        setOrders(prev => prev.filter(o => !selectedOrders.has(getOrderKey(o))));
        setSelectedOrders(new Set());
      } else {
        setError('Failed to bulk delete orders');
      }
    } catch {
      setError('Failed to bulk delete orders — network error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const viewDetail = async (order: Order) => {
    const key = getOrderKey(order);
    setDetailLoading(true);
    setDetailOrder(null);
    try {
      const res = await fetch(`/api/admin/optimoroute/orders/${encodeURIComponent(key)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDetailOrder(data);
      } else {
        setError('Failed to load order details');
      }
    } catch {
      setError('Failed to load order details — network error');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </div>
        <Button onClick={searchOrders} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </Button>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-bold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
        >
          Create Order
        </button>
        <button
          onClick={() => setShowOptimizer(true)}
          className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Optimize Routes
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-red-700 font-bold">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedOrders.size > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-bold text-teal-700">{selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedOrders(new Set())} className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white rounded-lg hover:bg-gray-100 transition-colors">
              Clear
            </button>
            <button onClick={bulkDelete} disabled={bulkDeleting}
              className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
              {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <LoadingSpinner />
      ) : orders.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selectedOrders.size === orders.length && orders.length > 0} onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Order #</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Date</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Type</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Address</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Time Window</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Driver</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400">Duration</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-400"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id || order.orderNo} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 w-8">
                      <input type="checkbox" checked={selectedOrders.has(getOrderKey(order))} onChange={() => toggleSelectOrder(getOrderKey(order))}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">
                      {order.orderNo || order.location?.locationName || order.id?.slice(0, 8) || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{order.date}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {TYPE_LABELS[order.type || ''] || order.type || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{order.location?.address || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {order.timeWindows?.[0] ? `${order.timeWindows[0].twFrom}–${order.timeWindows[0].twTo}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {order.assignedTo?.serial || order.assignedTo?.externalId || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{order.duration ? `${order.duration}m` : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => viewDetail(order)} className="text-xs font-bold text-teal-600 hover:text-teal-800">
                          View
                        </button>
                        <button onClick={() => setEditOrder(order)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                          Edit
                        </button>
                        <button onClick={() => setDeleteTarget(order)} className="text-xs font-bold text-red-500 hover:text-red-700">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 font-bold">
            {orders.length} order{orders.length !== 1 ? 's' : ''} found
          </div>
        </div>
      ) : searched ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 font-bold">No orders found for this date range</p>
        </div>
      ) : null}

      {/* Create Order Modal */}
      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} onCreated={searchOrders} />}

      {/* Edit Order Modal */}
      {editOrder && <EditOrderModal order={editOrder} onClose={() => setEditOrder(null)} onUpdated={searchOrders} />}

      {/* Route Optimizer Modal */}
      {showOptimizer && (
        <RouteOptimizerModal
          date={fromDate}
          onClose={() => setShowOptimizer(false)}
          onComplete={() => { setShowOptimizer(false); searchOrders(); }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-gray-900 mb-2">Delete Order</h2>
            <p className="text-sm text-gray-600 mb-1">
              Are you sure you want to delete order <span className="font-bold font-mono">{deleteTarget.orderNo || deleteTarget.location?.locationName || getOrderKey(deleteTarget).slice(0, 8)}</span>?
            </p>
            {deleteTarget.location?.address && (
              <p className="text-xs text-gray-400 mb-4">{deleteTarget.location.address}</p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {(detailOrder || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setDetailOrder(null); setDetailLoading(false); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-gray-900">Order Details</h2>
              <div className="flex items-center gap-2">
                {detailOrder?.order && (
                  <button
                    onClick={() => { const o = detailOrder.order; setDetailOrder(null); setDetailLoading(false); setEditOrder(o); }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    Edit
                  </button>
                )}
                <button onClick={() => { setDetailOrder(null); setDetailLoading(false); }} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {detailLoading ? <LoadingSpinner /> : detailOrder ? (
              <div className="space-y-3 text-sm">
                {detailOrder.order && (
                  <>
                    <Field label="Order #" value={detailOrder.order.orderNo} />
                    <Field label="Date" value={detailOrder.order.date} />
                    <Field label="Type" value={TYPE_LABELS[detailOrder.order.type] || detailOrder.order.type} />
                    <Field label="Address" value={detailOrder.order.location?.address} />
                    <Field label="Duration" value={detailOrder.order.duration ? `${detailOrder.order.duration} min` : undefined} />
                    <Field label="Priority" value={PRIORITY_LABELS[detailOrder.order.priority] || detailOrder.order.priority} />
                    {detailOrder.order.notes && <Field label="Notes" value={detailOrder.order.notes} />}
                  </>
                )}
                {detailOrder.schedule?.orderScheduled && detailOrder.schedule.scheduleInformation && (
                  <div className="border-t border-gray-100 pt-3">
                    <h3 className="text-xs font-black uppercase text-gray-400 mb-2">Schedule</h3>
                    <Field label="Driver" value={detailOrder.schedule.scheduleInformation.driverName} />
                    <Field label="Order #" value={detailOrder.schedule.scheduleInformation.orderNumber} />
                    <Field label="Scheduled At" value={detailOrder.schedule.scheduleInformation.scheduledAt} />
                  </div>
                )}
                {detailOrder.completion && (
                  <div className="border-t border-gray-100 pt-3">
                    <h3 className="text-xs font-black uppercase text-gray-400 mb-2">Completion</h3>
                    <Field label="Status" value={detailOrder.completion.status} />
                    {detailOrder.completion.tracking_url && (
                      <a href={detailOrder.completion.tracking_url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline text-xs">
                        Tracking link
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : <p className="text-gray-400 text-center py-4">No data available</p>}
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2">
      <span className="text-xs font-bold text-gray-400 w-24 flex-shrink-0">{label}:</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
};

// ── Create Order Modal ──

const CreateOrderModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [orderNo, setOrderNo] = useState(`ORD-${Date.now().toString(36).toUpperCase()}`);
  const [type, setType] = useState<'D' | 'P' | 'T'>('P');
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [address, setAddress] = useState('');
  const [locationName, setLocationName] = useState('');
  const [duration, setDuration] = useState('15');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'' | 'L' | 'M' | 'H' | 'C'>('');
  const [twFrom, setTwFrom] = useState('');
  const [twTo, setTwTo] = useState('');
  const [driverSerial, setDriverSerial] = useState('');
  const [load1, setLoad1] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/admin/optimoroute/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderNo, type, date,
          address: address.trim(),
          locationName: locationName.trim() || undefined,
          duration: parseInt(duration) || 15,
          notes: notes.trim() || undefined,
          ...(priority && { priority }),
          ...(twFrom && twTo && { timeWindows: [{ twFrom, twTo }] }),
          ...(driverSerial.trim() && { assignedTo: { serial: driverSerial.trim() } }),
          ...(load1 && { load1: parseFloat(load1) }),
          ...(email.trim() && { email: email.trim() }),
          ...(phone.trim() && { phone: phone.trim() }),
        }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => { onCreated(); onClose(); }, 1000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create order');
      }
    } catch {
      setError('Failed to create order');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gray-900 mb-4">Create Order</h2>

        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="font-bold text-gray-900">Order Created!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Order #</label>
                <input value={orderNo} onChange={e => setOrderNo(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Type</label>
                <select value={type} onChange={e => setType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                  <option value="P">Pickup</option>
                  <option value="D">Delivery</option>
                  <option value="T">Task</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Duration (min)</label>
                <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} required placeholder="Full street address"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Location Name (optional)</label>
              <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Customer name or business"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Special instructions..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
            </div>

            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors">
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-t border-gray-100 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Priority</label>
                    <select value={priority} onChange={e => setPriority(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                      <option value="">Default</option>
                      <option value="L">Low</option>
                      <option value="M">Medium</option>
                      <option value="H">High</option>
                      <option value="C">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Load (units)</label>
                    <input type="number" value={load1} onChange={e => setLoad1(e.target.value)} min="0" step="0.1" placeholder="0"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Time Window From</label>
                    <input type="time" value={twFrom} onChange={e => setTwFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Time Window To</label>
                    <input type="time" value={twTo} onChange={e => setTwTo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Assign to Driver (serial)</label>
                  <input value={driverSerial} onChange={e => setDriverSerial(e.target.value)} placeholder="Driver serial or external ID"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Customer Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Customer Phone</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1234567890"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button type="submit" disabled={sending || !address.trim()}>
                {sending ? 'Creating...' : 'Create Order'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ── Edit Order Modal ──

const EditOrderModal: React.FC<{ order: Order; onClose: () => void; onUpdated: () => void }> = ({ order, onClose, onUpdated }) => {
  const [date, setDate] = useState(order.date || '');
  const [address, setAddress] = useState(order.location?.address || '');
  const [locationName, setLocationName] = useState(order.location?.locationName || '');
  const [duration, setDuration] = useState(String(order.duration || '15'));
  const [notes, setNotes] = useState(order.notes || '');
  const [priority, setPriority] = useState<'' | 'L' | 'M' | 'H' | 'C'>((order.priority as any) || '');
  const [twFrom, setTwFrom] = useState(order.timeWindows?.[0]?.twFrom || '');
  const [twTo, setTwTo] = useState(order.timeWindows?.[0]?.twTo || '');
  const [driverSerial, setDriverSerial] = useState(order.assignedTo?.serial || order.assignedTo?.externalId || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const orderNo = order.orderNo || order.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/optimoroute/orders/${encodeURIComponent(orderNo)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date,
          address: address.trim(),
          locationName: locationName.trim() || undefined,
          duration: parseInt(duration) || 15,
          notes: notes.trim() || undefined,
          ...(priority && { priority }),
          ...(twFrom && twTo && { timeWindows: [{ twFrom, twTo }] }),
          ...(driverSerial.trim() && { assignedTo: { serial: driverSerial.trim() } }),
        }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => { onUpdated(); onClose(); }, 1000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update order');
      }
    } catch {
      setError('Failed to update order');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black text-gray-900 mb-4">Edit Order</h2>

        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="font-bold text-gray-900">Order Updated!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Order #</label>
                <input value={orderNo} disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Type</label>
                <input value={TYPE_LABELS[order.type || ''] || order.type || '—'} disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Duration (min)</label>
                <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min="1"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} required placeholder="Full street address"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Location Name (optional)</label>
              <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Customer name or business"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Special instructions..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
            </div>

            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors">
              {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                    <option value="">Default</option>
                    <option value="L">Low</option>
                    <option value="M">Medium</option>
                    <option value="H">High</option>
                    <option value="C">Critical</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Time Window From</label>
                    <input type="time" value={twFrom} onChange={e => setTwFrom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Time Window To</label>
                    <input type="time" value={twTo} onChange={e => setTwTo(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Assign to Driver (serial)</label>
                  <input value={driverSerial} onChange={e => setDriverSerial(e.target.value)} placeholder="Driver serial or external ID"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button type="submit" disabled={sending || !address.trim()}>
                {sending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default OrdersView;
