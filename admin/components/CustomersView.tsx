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

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: any;
  adminName: string;
  adminEmail: string;
  createdAt: string;
}

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

const CustomerCommunicationsTab: React.FC<{ customerId: string; customerName: string }> = ({ customerId, customerName }) => {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newInitialMsg, setNewInitialMsg] = useState('');

  useEffect(() => {
    fetch(`/api/admin/conversations`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const all = data.conversations || [];
        const filtered = all.filter((c: any) =>
          c.participants?.some((p: any) => p.participant_id === customerId && p.participant_type === 'user')
        );
        setConversations(filtered);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customerId]);

  const loadMessages = async (convId: string) => {
    setSelectedConvId(convId);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/conversations/${convId}/messages`, { credentials: 'include' });
      if (res.ok) setMessages(await res.json());
      fetch(`/api/admin/conversations/${convId}/read`, { method: 'PUT', credentials: 'include' }).catch(() => {});
    } catch {}
    setLoadingMessages(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConvId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: newMessage.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => [...prev, msg]);
        setNewMessage('');
      }
    } catch {}
    setSending(false);
  };

  const handleNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInitialMsg.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: newSubject.trim() || `Chat with ${customerName}`,
          participantIds: [{ id: customerId, type: 'user' }],
        }),
      });
      if (res.ok) {
        const conv = await res.json();
        await fetch(`/api/admin/conversations/${conv.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ body: newInitialMsg.trim() }),
        });
        setConversations(prev => [conv, ...prev]);
        setSelectedConvId(conv.id);
        setShowNewChat(false);
        setNewSubject('');
        setNewInitialMsg('');
        loadMessages(conv.id);
      }
    } catch {}
    setSending(false);
  };

  if (loading) return <div className="py-4 text-center text-gray-400 text-sm">Loading...</div>;

  if (selectedConvId) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setSelectedConvId(null)} className="text-sm text-teal-600 font-bold hover:text-teal-700">← Back to conversations</button>
        </div>
        <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
          {loadingMessages ? (
            <div className="py-4 text-center text-gray-400 text-sm">Loading messages...</div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No messages yet</p>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[75%]">
                  <p className="text-[10px] text-gray-400 mb-0.5">
                    <span className="font-bold">{msg.sender_name}</span> · {new Date(msg.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className={`px-3 py-2 rounded-xl text-sm ${
                    msg.sender_type === 'admin' ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                  }`}>
                    {msg.body}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleSend} className="flex gap-2 pt-3 border-t border-gray-100">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
          <Button type="submit" size="sm" disabled={sending || !newMessage.trim()}>Send</Button>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Conversations</h3>
        <Button size="sm" onClick={() => setShowNewChat(true)}>New Message</Button>
      </div>

      {showNewChat && (
        <Card className="p-4 border-2 border-teal-200">
          <form onSubmit={handleNewConversation} className="space-y-3">
            <input
              type="text"
              value={newSubject}
              onChange={e => setNewSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <textarea
              value={newInitialMsg}
              onChange={e => setNewInitialMsg(e.target.value)}
              placeholder="Type your message..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewChat(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={sending || !newInitialMsg.trim()}>Send</Button>
            </div>
          </form>
        </Card>
      )}

      {conversations.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-gray-400">No conversations with this customer yet.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv: any) => (
            <Card key={conv.id} className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => loadMessages(conv.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">{conv.subject || 'Conversation'}</p>
                  {conv.last_message && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{conv.last_message}</p>}
                </div>
                <div className="text-right">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${conv.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{conv.status}</span>
                  <p className="text-xs text-gray-400 mt-1">{conv.message_count} msgs</p>
                </div>
              </div>
            </Card>
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
  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'billing' | 'activity' | 'communications'>('overview');

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

  const tabs: { key: typeof activeTab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'properties', label: 'Properties', count: customer.properties.length },
    { key: 'billing', label: 'Billing' },
    { key: 'activity', label: 'Activity' },
    { key: 'communications', label: 'Messages' },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-sm">
        ← Back to customer list
      </Button>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-black text-white">{customer.firstName?.[0]}{customer.lastName?.[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-gray-900">{customer.name}</h2>
                {customer.isAdmin && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-teal-700 bg-teal-100 px-2 py-1 rounded-full">Admin</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{customer.email}</p>
              <p className="text-xs text-gray-400">{customer.phone || 'No phone'} · Member since {formatDate(customer.memberSince || customer.createdAt)}</p>
              {customer.stripeCustomerId && (
                <p className="text-xs text-gray-400 mt-1">Stripe: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{customer.stripeCustomerId}</span></p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
              Edit
            </Button>
            <Button onClick={handleImpersonate} disabled={impersonating} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              {impersonating ? 'Switching...' : 'Sign In as Customer'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Full Name</span>
                <span className="text-sm font-bold text-gray-900">{customer.firstName} {customer.lastName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Email</span>
                <span className="text-sm font-bold text-gray-900">{customer.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Phone</span>
                <span className="text-sm font-bold text-gray-900">{customer.phone || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Properties</span>
                <span className="text-sm font-bold text-gray-900">{customer.properties.length}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Admin</span>
                <span className={`text-sm font-bold ${customer.isAdmin ? 'text-teal-600' : 'text-gray-400'}`}>{customer.isAdmin ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Notes & Tags</h3>
            <NotesTab customerId={customer.id} />
          </Card>
        </div>
      )}

      {activeTab === 'properties' && (
        <Card className="p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Properties ({customer.properties.length})</h3>
          {customer.properties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customer.properties.map(p => (
                <div key={p.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-sm font-bold text-gray-900">{p.address}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{p.serviceType}</span>
                    {p.transferStatus && <span className="text-[9px] font-black uppercase tracking-widest bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Transfer: {p.transferStatus}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No properties linked to this customer</p>
          )}
        </Card>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6">
          {customer.stripe ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Balance</p>
                  <p className={`text-2xl font-black ${customer.stripe.balance < 0 ? 'text-green-600' : customer.stripe.balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    ${Math.abs(customer.stripe.balance).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">{customer.stripe.balance < 0 ? 'credit' : customer.stripe.balance > 0 ? 'owed' : 'zero balance'}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Subscriptions</p>
                  <p className="text-2xl font-black text-gray-900">{customer.stripe.subscriptions.length}</p>
                  <p className="text-xs text-gray-400">{customer.stripe.subscriptions.filter(s => s.status === 'active').length} active</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Payment Methods</p>
                  <p className="text-2xl font-black text-gray-900">{customer.stripe.paymentMethods.length}</p>
                  <p className="text-xs text-gray-400">on file</p>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Subscriptions</h3>
                  {customer.stripe.subscriptions.length > 0 ? (
                    <div className="space-y-3">
                      {customer.stripe.subscriptions.map(sub => (
                        <div key={sub.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex justify-between items-center">
                            <StatusBadge status={sub.status} />
                            <span className="text-xs text-gray-400">until {formatDate(sub.currentPeriodEnd)}</span>
                          </div>
                          {sub.items.map((item, i) => (
                            <p key={i} className="text-sm text-gray-700 mt-2">{item.productName} — <span className="font-bold">${item.amount}/{item.interval}</span></p>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No subscriptions</p>
                  )}

                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mt-6 mb-4">Payment Methods</h3>
                  {customer.stripe.paymentMethods.length > 0 ? (
                    <div className="space-y-2">
                      {customer.stripe.paymentMethods.map(pm => (
                        <div key={pm.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="w-10 h-7 bg-gray-200 rounded flex items-center justify-center text-[9px] font-black uppercase text-gray-500">{pm.brand}</div>
                          <span className="text-sm text-gray-700 font-mono">···· {pm.last4}</span>
                          <span className="text-xs text-gray-400 ml-auto">{pm.expMonth}/{pm.expYear}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No payment methods on file</p>
                  )}
                </Card>

                <Card className="p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Recent Invoices ({customer.stripe.invoices.length})</h3>
                  {customer.stripe.invoices.length > 0 ? (
                    <div className="space-y-2">
                      {customer.stripe.invoices.map(inv => (
                        <div key={inv.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{inv.number || inv.id}</p>
                            <p className="text-xs text-gray-400">{formatDate(inv.created)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-gray-900">${inv.amount.toFixed(2)}</span>
                            <StatusBadge status={inv.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No invoices</p>
                  )}
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-gray-400 text-sm">No Stripe account linked to this customer</p>
              {customer.stripeCustomerId && <p className="text-xs text-gray-300 mt-1">ID: {customer.stripeCustomerId}</p>}
            </Card>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <Card className="p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Activity History</h3>
          <CustomerActivityTab customerId={customer.id} />
        </Card>
      )}

      {activeTab === 'communications' && (
        <CustomerCommunicationsTab customerId={customer.id} customerName={customer.name} />
      )}

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
  onSend: (channel: string, message: string) => void;
  isSending: boolean;
}> = ({ isOpen, selectedCount, onClose, onSend, isSending }) => {
  const [channel, setChannel] = useState('email');
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
            <label className="block text-xs font-bold text-gray-500 mb-1">Channel</label>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="both">Email + SMS</option>
            </select>
          </div>
          {channel !== 'email' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">SMS will only be sent to customers who have a phone number on file.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              placeholder="Enter notification message..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
            {channel !== 'email' && (
              <p className="text-xs text-gray-400 mt-1">{message.length}/160 characters (SMS best practice)</p>
            )}
          </div>
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSending} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" disabled={isSending || !message.trim()} onClick={() => onSend(channel, message)} className="flex-1">
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

interface NavFilter { tab?: string; filter?: string; sort?: string; search?: string; }

const CustomersView: React.FC<{ navFilter?: NavFilter | null; onFilterConsumed?: () => void }> = ({ navFilter, onFilterConsumed }) => {
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
