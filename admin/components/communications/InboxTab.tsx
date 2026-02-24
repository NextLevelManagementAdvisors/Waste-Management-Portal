import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, EmptyState, StatusBadge } from '../ui/index.ts';

interface Participant {
  id: string;
  participant_id: string;
  participant_type: string;
  role: string;
  participant_name: string;
  participant_email: string;
}

interface Conversation {
  id: string;
  subject: string | null;
  type: string;
  status: string;
  message_count: string;
  last_message: string | null;
  last_sender_type: string | null;
  last_message_at: string | null;
  unread_count?: string;
  created_at: string;
  participants: Participant[];
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: string;
  sender_name: string;
  body: string;
  message_type: string;
  created_at: string;
}

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
};

const formatFullDate = (dateStr: string) => {
  try { return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return dateStr; }
};

const getParticipantLabel = (participants: Participant[]) => {
  const nonAdmin = participants.filter(p => p.role !== 'admin');
  if (nonAdmin.length === 0) return 'Internal';
  return nonAdmin.map(p => p.participant_name || p.participant_email || 'Unknown').join(', ');
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'user': return 'bg-blue-100 text-blue-700';
    case 'admin': return 'bg-teal-100 text-teal-700';
    case 'driver': return 'bg-orange-100 text-orange-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const InboxTab: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ status: statusFilter, limit: '50' });
      const res = await fetch(`/api/admin/conversations?${query}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // WebSocket for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'conversation:new') {
          loadConversations();
        } else if (data.event === 'message:new') {
          loadConversations();
          if (expandedId && data.data?.conversationId === expandedId) {
            setMessages(prev => {
              if (prev.find(m => m.id === data.data.message.id)) return prev;
              return [...prev, data.data.message];
            });
          }
        }
      } catch {}
    };

    return () => { ws.close(); };
  }, [loadConversations, expandedId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleExpand = async (conv: Conversation) => {
    if (expandedId === conv.id) {
      setExpandedId(null);
      setMessages([]);
      return;
    }
    setExpandedId(conv.id);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/admin/conversations/${conv.id}/messages`, { credentials: 'include' });
      if (res.ok) setMessages(await res.json());
      fetch(`/api/admin/conversations/${conv.id}/read`, { method: 'PUT', credentials: 'include' }).catch(() => {});
    } catch {}
    setLoadingMessages(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !expandedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/conversations/${expandedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: newMessage.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        setNewMessage('');
      }
    } catch {}
    setSending(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/conversations/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      loadConversations();
    } catch {}
  };

  // Filter conversations by type and search
  const filtered = conversations.filter(conv => {
    if (typeFilter !== 'all') {
      const hasType = conv.participants.some(p => p.participant_type === typeFilter);
      if (!hasType) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchSubject = conv.subject?.toLowerCase().includes(q);
      const matchParticipant = conv.participants.some(p =>
        p.participant_name?.toLowerCase().includes(q) || p.participant_email?.toLowerCase().includes(q)
      );
      if (!matchSubject && !matchParticipant) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="all">All Participants</option>
            <option value="user">Customers</option>
            <option value="driver">Drivers</option>
            <option value="admin">Admins</option>
          </select>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {['all', 'open', 'closed'].map(s => (
              <button
                type="button"
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${
                  statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={() => setShowNewModal(true)}>New Conversation</Button>
      </div>

      <span className="text-sm text-gray-400">{total} conversation{total !== 1 ? 's' : ''}{searchQuery && `, ${filtered.length} shown`}</span>

      {/* Conversation List */}
      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Conversations"
          message={searchQuery ? 'No conversations match your search.' : statusFilter === 'all' ? 'Start a conversation with a customer or driver.' : `No ${statusFilter} conversations.`}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(conv => {
            const isExpanded = expandedId === conv.id;
            return (
              <Card key={conv.id} className={`transition-shadow ${isExpanded ? 'shadow-md ring-1 ring-teal-200' : 'hover:shadow-md'}`}>
                {/* Conversation Header (always visible) */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => handleExpand(conv)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        conv.type === 'group' ? 'bg-purple-100' : 'bg-blue-100'
                      }`}>
                        {conv.type === 'group' ? (
                          <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        ) : (
                          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black text-gray-900 truncate">{conv.subject || getParticipantLabel(conv.participants)}</h3>
                          <StatusBadge status={conv.status} />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {conv.participants.filter(p => p.role !== 'admin').map(p => (
                            <span key={p.id} className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${getTypeColor(p.participant_type)}`}>
                              {p.participant_name || p.role}
                            </span>
                          ))}
                        </div>
                        {!isExpanded && conv.last_message && (
                          <p className="text-sm text-gray-500 mt-1.5 truncate">
                            {conv.last_sender_type === 'admin' && <span className="font-bold">You: </span>}
                            {conv.last_message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs text-gray-400">{conv.last_message_at ? formatDate(conv.last_message_at) : formatDate(conv.created_at)}</span>
                      <span className="text-xs text-gray-400">{conv.message_count} msg{parseInt(conv.message_count) !== 1 ? 's' : ''}</span>
                      {conv.unread_count && parseInt(conv.unread_count) > 0 && (
                        <span className="bg-teal-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Chat Thread */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {/* Status bar */}
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                      <div className="flex items-center gap-2">
                        {conv.participants.map(p => (
                          <span key={p.id} className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${getTypeColor(p.participant_type)}`}>
                            {p.participant_name || p.role}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {conv.status === 'open' ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleStatusChange(conv.id, 'closed'); }} className="text-xs font-bold text-gray-500 hover:text-red-600 transition-colors">Close</button>
                        ) : (
                          <button type="button" onClick={(e) => { e.stopPropagation(); handleStatusChange(conv.id, 'open'); }} className="text-xs font-bold text-gray-500 hover:text-teal-600 transition-colors">Reopen</button>
                        )}
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
                      {loadingMessages ? (
                        <div className="py-4 text-center"><LoadingSpinner /></div>
                      ) : messages.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">No messages yet</p>
                      ) : (
                        messages.map(msg => (
                          <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                            <div className="max-w-[75%]">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${getTypeColor(msg.sender_type)}`}>
                                  {msg.sender_type}
                                </span>
                                <span className="text-xs font-bold text-gray-700">{msg.sender_name}</span>
                                <span className="text-xs text-gray-400">{formatFullDate(msg.created_at)}</span>
                              </div>
                              <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                                msg.sender_type === 'admin'
                                  ? 'bg-teal-600 text-white rounded-tr-sm'
                                  : msg.sender_type === 'driver'
                                  ? 'bg-orange-50 text-gray-900 border border-orange-200 rounded-tl-sm'
                                  : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                              }`}>
                                {msg.body}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Reply */}
                    <form onSubmit={handleSend} className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Type a reply..."
                        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        disabled={sending}
                      />
                      <Button type="submit" disabled={sending || !newMessage.trim()} size="sm">
                        {sending ? '...' : 'Send'}
                      </Button>
                    </form>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* New Conversation Modal */}
      {showNewModal && (
        <NewConversationModal
          onClose={() => setShowNewModal(false)}
          onCreated={(conv) => {
            setExpandedId(conv.id);
            loadConversations();
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
};

// ---- New Conversation Modal ----
const NewConversationModal: React.FC<{
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}> = ({ onClose, onCreated }) => {
  const [subject, setSubject] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<{ id: string; type: string; name: string }[]>([]);
  const [initialMessage, setInitialMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/customers', { credentials: 'include' })
      .then(r => r.json()).then(data => setCustomers(data.customers || data || [])).catch(() => {});
    fetch('/api/admin/drivers', { credentials: 'include' })
      .then(r => r.json()).then(data => setDrivers(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const toggleParticipant = (id: string, type: string, name: string) => {
    setSelectedParticipants(prev => {
      const exists = prev.find(p => p.id === id && p.type === type);
      if (exists) return prev.filter(p => !(p.id === id && p.type === type));
      return [...prev, { id, type, name }];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedParticipants.length === 0) { setError('Select at least one participant'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: subject.trim() || undefined, participantIds: selectedParticipants.map(p => ({ id: p.id, type: p.type })) }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error || 'Failed'); return; }
      const conv = await res.json();
      if (initialMessage.trim()) {
        await fetch(`/api/admin/conversations/${conv.id}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ body: initialMessage.trim() }),
        });
      }
      onCreated(conv);
    } catch { setError('Failed to create conversation'); }
    finally { setSaving(false); }
  };

  const filteredCustomers = participantSearch
    ? customers.filter((c: any) => {
        const name = (c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`).toLowerCase();
        return name.includes(participantSearch.toLowerCase()) || c.email?.toLowerCase().includes(participantSearch.toLowerCase());
      })
    : customers;

  const filteredDrivers = participantSearch
    ? drivers.filter((d: any) => d.name?.toLowerCase().includes(participantSearch.toLowerCase()) || d.email?.toLowerCase().includes(participantSearch.toLowerCase()))
    : drivers;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-2xl p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">New Conversation</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Pickup issue, Billing question..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Participants</label>
            {selectedParticipants.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedParticipants.map(p => (
                  <span key={`${p.type}:${p.id}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${p.type === 'driver' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {p.name}
                    <button type="button" onClick={() => toggleParticipant(p.id, p.type, p.name)} className="text-current hover:opacity-60">&times;</button>
                  </span>
                ))}
              </div>
            )}
            <input type="text" value={participantSearch} onChange={e => setParticipantSearch(e.target.value)} placeholder="Search participants..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 mb-2" />
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500">Customers</p>
              <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg">
                {filteredCustomers.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                    <input type="checkbox" checked={!!selectedParticipants.find(p => p.id === c.id && p.type === 'user')}
                      onChange={() => toggleParticipant(c.id, 'user', c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                  </label>
                ))}
                {filteredCustomers.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No customers found</p>}
              </div>
              <p className="text-xs font-bold text-gray-500 mt-3">Drivers</p>
              <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg">
                {filteredDrivers.map((d: any) => (
                  <label key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                    <input type="checkbox" checked={!!selectedParticipants.find(p => p.id === d.id && p.type === 'driver')}
                      onChange={() => toggleParticipant(d.id, 'driver', d.name)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{d.name}</p>
                      <p className="text-xs text-gray-400 truncate">{d.email || d.phone || 'No contact info'}</p>
                    </div>
                  </label>
                ))}
                {filteredDrivers.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No drivers</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">First Message (optional)</label>
            <textarea value={initialMessage} onChange={e => setInitialMessage(e.target.value)} rows={3} placeholder="Type the first message..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving || selectedParticipants.length === 0} className="flex-1">{saving ? 'Creating...' : 'Start Conversation'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default InboxTab;
