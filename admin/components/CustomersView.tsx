import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/Card.tsx';
import { Button } from '../../components/Button.tsx';
import { MagnifyingGlassIcon, ArrowRightIcon } from '../../components/Icons.tsx';
import { LoadingSpinner, Pagination, StatusBadge, EmptyState, FilterBar, ConfirmDialog } from './shared.tsx';

interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberSince: string;
  stripeCustomerId: string | null;
  isAdmin: boolean;
  createdAt: string;
  propertyCount: number;
}

interface CustomerDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  memberSince: string;
  stripeCustomerId: string | null;
  isAdmin: boolean;
  createdAt: string;
  properties: { id: string; address: string; serviceType: string; transferStatus: string | null }[];
  stripe: {
    balance: number;
    subscriptions: { id: string; status: string; currentPeriodEnd: string; items: { productName: string; amount: number; interval: string }[] }[];
    invoices: { id: string; number: string; amount: number; status: string; created: string }[];
    paymentMethods: { id: string; brand: string; last4: string; expMonth: number; expYear: number }[];
  } | null;
}

interface CustomerNote {
  id: string;
  note: string;
  tags: string[];
  createdAt: string;
  adminName?: string;
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const EditCustomerModal: React.FC<{
  customer: CustomerDetail;
  onClose: () => void;
  onSaved: (updated: CustomerDetail) => void;
}> = ({ customer, onClose, onSaved }) => {
  const [form, setForm] = useState({
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    email: customer.email || '',
    phone: customer.phone || '',
    isAdmin: customer.isAdmin || false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        onSaved(updated);
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to update customer');
      }
    } catch {
      setError('Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-lg p-6 shadow-lg">
        <h2 className="text-lg font-black text-gray-900 mb-4">Edit Customer</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-gray-500">Admin Access</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isAdmin: !f.isAdmin }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isAdmin ? 'bg-teal-600' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isAdmin ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" type="button" onClick={onClose} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={saving} className="flex-1">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const NotesTab: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [newTags, setNewTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/notes`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setNotes(Array.isArray(data) ? data : data.notes || []);
      }
    } catch (e) {
      console.error('Failed to load notes:', e);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch(`/api/admin/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: newNote, tags }),
      });
      if (res.ok) {
        setNewNote('');
        setNewTags('');
        loadNotes();
      }
    } catch (e) {
      console.error('Failed to add note:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`/api/admin/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
      }
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  if (loading) return <div className="py-4 text-center text-gray-400 text-sm">Loading notes...</div>;

  return (
    <div className="space-y-4">
      <form onSubmit={handleAddNote} className="space-y-3">
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={newTags}
            onChange={e => setNewTags(e.target.value)}
            placeholder="Tags (comma separated)"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
          <Button type="submit" size="sm" disabled={submitting || !newNote.trim()}>
            {submitting ? 'Adding...' : 'Add Note'}
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex justify-between items-start">
                <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">{note.note}</p>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="text-gray-400 hover:text-red-500 ml-2 text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {note.tags?.map((tag, i) => (
                  <span key={i} className="text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{tag}</span>
                ))}
                <span className="text-xs text-gray-400 ml-auto">{formatDate(note.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CustomerDetailPanel: React.FC<{
  customer: CustomerDetail;
  onBack: () => void;
  onCustomerUpdated: (updated: CustomerDetail) => void;
}> = ({ customer, onBack, onCustomerUpdated }) => {
  const [impersonating, setImpersonating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<'properties' | 'notes'>('properties');

  const handleImpersonate = async () => {
    setImpersonating(true);
    try {
      const res = await fetch(`/api/admin/impersonate/${customer.id}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to impersonate');
      }
    } catch {
      alert('Failed to impersonate customer');
    } finally {
      setImpersonating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-sm">
        ← Back to customer list
      </Button>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-gray-900">{customer.name}</h2>
              {customer.isAdmin && (
                <span className="text-[9px] font-black uppercase tracking-widest text-teal-700 bg-teal-100 px-2 py-1 rounded-full">Admin</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{customer.email}</p>
            <p className="text-sm text-gray-400">{customer.phone || 'No phone'}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
              Edit
            </Button>
            <div className="text-sm text-gray-500 space-y-1 text-right">
              <p>Member since: <span className="font-bold text-gray-700">{formatDate(customer.memberSince || customer.createdAt)}</span></p>
              {customer.stripeCustomerId && (
                <p>Stripe: <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{customer.stripeCustomerId}</span></p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <Button onClick={handleImpersonate} disabled={impersonating} className="bg-indigo-600 hover:bg-indigo-700">
            {impersonating ? 'Switching...' : 'Sign In as Customer'}
          </Button>
          <p className="text-xs text-gray-400 mt-2">View the client portal exactly as this customer sees it.</p>
        </div>
      </Card>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('properties')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'properties' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Properties ({customer.properties.length})
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'notes' ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Notes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {activeTab === 'properties' && (
            <Card className="p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Properties ({customer.properties.length})</h3>
              {customer.properties.length > 0 ? (
                <div className="space-y-3">
                  {customer.properties.map(p => (
                    <div key={p.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <p className="text-sm font-bold text-gray-900">{p.address}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs text-gray-500">{p.serviceType}</span>
                        {p.transferStatus && <span className="text-xs text-orange-600 font-bold">Transfer: {p.transferStatus}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No properties</p>
              )}
            </Card>
          )}
          {activeTab === 'notes' && (
            <Card className="p-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Notes</h3>
              <NotesTab customerId={customer.id} />
            </Card>
          )}
        </div>

        {customer.stripe && (
          <Card className="p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Stripe Account</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Balance</span>
                <span className={`text-sm font-black ${customer.stripe.balance < 0 ? 'text-green-600' : customer.stripe.balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                  ${Math.abs(customer.stripe.balance).toFixed(2)} {customer.stripe.balance < 0 ? 'credit' : customer.stripe.balance > 0 ? 'owed' : ''}
                </span>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">Payment Methods</p>
                {customer.stripe.paymentMethods.map(pm => (
                  <div key={pm.id} className="flex items-center gap-2 text-sm text-gray-700 py-1">
                    <span className="capitalize font-bold">{pm.brand}</span>
                    <span>····{pm.last4}</span>
                    <span className="text-gray-400">{pm.expMonth}/{pm.expYear}</span>
                  </div>
                ))}
                {customer.stripe.paymentMethods.length === 0 && <p className="text-xs text-gray-400">No payment methods</p>}
              </div>

              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">Subscriptions ({customer.stripe.subscriptions.length})</p>
                {customer.stripe.subscriptions.map(sub => (
                  <div key={sub.id} className="p-2 bg-gray-50 rounded-lg mb-1">
                    <div className="flex justify-between items-center">
                      <StatusBadge status={sub.status} />
                      <span className="text-xs text-gray-400">until {formatDate(sub.currentPeriodEnd)}</span>
                    </div>
                    {sub.items.map((item, i) => (
                      <p key={i} className="text-sm text-gray-700 mt-1">{item.productName} - ${item.amount}/{item.interval}</p>
                    ))}
                  </div>
                ))}
                {customer.stripe.subscriptions.length === 0 && <p className="text-xs text-gray-400">No subscriptions</p>}
              </div>

              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">Recent Invoices ({customer.stripe.invoices.length})</p>
                {customer.stripe.invoices.map(inv => (
                  <div key={inv.id} className="flex justify-between items-center py-1 text-sm">
                    <span className="text-gray-700">{inv.number || inv.id}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">${inv.amount.toFixed(2)}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                ))}
                {customer.stripe.invoices.length === 0 && <p className="text-xs text-gray-400">No invoices</p>}
              </div>
            </div>
          </Card>
        )}
      </div>

      {showEdit && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setShowEdit(false);
            onCustomerUpdated(updated);
          }}
        />
      )}
    </div>
  );
};

const BulkNotifyDialog: React.FC<{
  isOpen: boolean;
  selectedCount: number;
  onClose: () => void;
  onSend: (type: string, message: string) => void;
  isSending: boolean;
}> = ({ isOpen, selectedCount, onClose, onSend, isSending }) => {
  const [notifType, setNotifType] = useState('email');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-md p-6 shadow-lg">
        <h2 className="text-lg font-black text-gray-900 mb-1">Send Notification</h2>
        <p className="text-sm text-gray-500 mb-4">Send to {selectedCount} selected customer{selectedCount !== 1 ? 's' : ''}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Notification Type</label>
            <select
              value={notifType}
              onChange={e => setNotifType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push Notification</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              placeholder="Enter notification message..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSending} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" disabled={isSending || !message.trim()} onClick={() => onSend(notifType, message)} className="flex-1">
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [stripeFilter, setStripeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkNotify, setShowBulkNotify] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (serviceFilter !== 'all') params.set('serviceType', serviceFilter);
    if (stripeFilter !== 'all') params.set('stripeStatus', stripeFilter);
    if (sortBy) params.set('sort', sortBy);
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

  const loadCustomerDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, { credentials: 'include' });
      if (res.ok) setSelectedCustomer(await res.json());
    } catch (e) {
      console.error('Failed to load customer detail:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (serviceFilter !== 'all') params.set('serviceType', serviceFilter);
    if (stripeFilter !== 'all') params.set('stripeStatus', stripeFilter);
    if (sortBy) params.set('sort', sortBy);
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

  const handleBulkNotify = async (type: string, message: string) => {
    setBulkSending(true);
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          message,
          userIds: Array.from(selectedIds),
        }),
      });
      if (res.ok) {
        setShowBulkNotify(false);
        setSelectedIds(new Set());
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

  if (selectedCustomer) {
    return detailLoading ? (
      <LoadingSpinner />
    ) : (
      <CustomerDetailPanel
        customer={selectedCustomer}
        onBack={() => setSelectedCustomer(null)}
        onCustomerUpdated={(updated) => setSelectedCustomer(updated)}
      />
    );
  }

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
            <div className="ml-auto">
              <Button size="sm" onClick={() => setShowBulkNotify(true)}>
                Notify ({selectedIds.size})
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
                        <Button variant="ghost" size="sm" onClick={() => loadCustomerDetail(c.id)}>
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

export default CustomersView;
