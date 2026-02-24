import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, EmptyState, StatusBadge } from '../ui/index.ts';
import NotificationSender from '../operations/NotificationSender.tsx';

export type CommsTabType = 'conversations' | 'notifications';

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
  } catch {
    return dateStr;
  }
};

const formatFullDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
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

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (conv: Conversation) => void;
}

const NewConversationModal: React.FC<NewConversationModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [subject, setSubject] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<{ id: string; type: string; name: string }[]>([]);
  const [initialMessage, setInitialMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/admin/customers', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setCustomers(data.customers || data || []))
      .catch(console.error);
    fetch('/api/admin/drivers', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setDrivers(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [isOpen]);

  const toggleParticipant = (id: string, type: string, name: string) => {
    setSelectedParticipants(prev => {
      const exists = prev.find(p => p.id === id && p.type === type);
      if (exists) return prev.filter(p => !(p.id === id && p.type === type));
      return [...prev, { id, type, name }];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedParticipants.length === 0) {
      setError('Select at least one participant');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: subject.trim() || undefined,
          participantIds: selectedParticipants.map(p => ({ id: p.id, type: p.type })),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error || 'Failed to create');
        return;
      }
      const conv = await res.json();

      if (initialMessage.trim()) {
        await fetch(`/api/admin/conversations/${conv.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ body: initialMessage.trim() }),
        });
      }

      onCreated(conv);
      setSubject('');
      setSelectedParticipants([]);
      setInitialMessage('');
      onClose();
    } catch {
      setError('Failed to create conversation');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-2xl p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">New Conversation</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Pickup issue, Billing question..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Participants</label>
            {selectedParticipants.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedParticipants.map(p => (
                  <span key={`${p.type}:${p.id}`} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${p.type === 'driver' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {p.name}
                    <button type="button" onClick={() => toggleParticipant(p.id, p.type, p.name)} className="text-current hover:opacity-60">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500">Customers</p>
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
                {customers.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                    <input
                      type="checkbox"
                      checked={!!selectedParticipants.find(p => p.id === c.id && p.type === 'user')}
                      onChange={() => toggleParticipant(c.id, 'user', c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{c.name || `${c.firstName || c.first_name} ${c.lastName || c.last_name}`}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                  </label>
                ))}
                {customers.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No customers</p>}
              </div>

              <p className="text-xs font-bold text-gray-500 mt-3">Drivers</p>
              <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg">
                {drivers.map((d: any) => (
                  <label key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                    <input
                      type="checkbox"
                      checked={!!selectedParticipants.find(p => p.id === d.id && p.type === 'driver')}
                      onChange={() => toggleParticipant(d.id, 'driver', d.name)}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{d.name}</p>
                      <p className="text-xs text-gray-400 truncate">{d.email || d.phone || 'No contact info'}</p>
                    </div>
                  </label>
                ))}
                {drivers.length === 0 && <p className="text-sm text-gray-400 text-center py-3">No drivers yet — add them in the Team tab</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">First Message (optional)</label>
            <textarea
              value={initialMessage}
              onChange={e => setInitialMessage(e.target.value)}
              rows={3}
              placeholder="Type the first message..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving || selectedParticipants.length === 0} className="flex-1">
              {saving ? 'Creating...' : 'Start Conversation'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const ChatThread: React.FC<{
  conversation: Conversation;
  onBack: () => void;
  onStatusChange: (id: string, status: string) => void;
}> = ({ conversation, onBack, onStatusChange }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/conversations/${conversation.id}/messages`, { credentials: 'include' });
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    loadMessages();
    fetch(`/api/admin/conversations/${conversation.id}/read`, { method: 'PUT', credentials: 'include' }).catch(() => {});
  }, [loadMessages, conversation.id]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'message:new' && data.data?.conversationId === conversation.id) {
          setMessages(prev => {
            if (prev.find(m => m.id === data.data.message.id)) return prev;
            return [...prev, data.data.message];
          });
          fetch(`/api/admin/conversations/${conversation.id}/read`, { method: 'PUT', credentials: 'include' }).catch(() => {});
        }
      } catch {}
    };

    return () => {
      ws.close();
    };
  }, [conversation.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/conversations/${conversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: newMessage.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setNewMessage('');
      }
    } catch (e) {
      console.error('Failed to send message:', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} title="Back to conversations" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h3 className="text-base font-black text-gray-900">{conversation.subject || getParticipantLabel(conversation.participants)}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {conversation.participants.map(p => (
                <span key={p.id} className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${getTypeColor(p.participant_type)}`}>
                  {p.participant_name || p.role}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={conversation.status} />
          {conversation.status === 'open' ? (
            <Button variant="secondary" size="sm" onClick={() => onStatusChange(conversation.id, 'closed')}>Close</Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onStatusChange(conversation.id, 'open')}>Reopen</Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {loading ? (
          <LoadingSpinner />
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] ${msg.sender_type === 'admin' ? 'order-2' : 'order-1'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${getTypeColor(msg.sender_type)}`}>
                    {msg.sender_type}
                  </span>
                  <span className="text-xs font-bold text-gray-700">{msg.sender_name}</span>
                  <span className="text-xs text-gray-400">{formatFullDate(msg.created_at)}</span>
                </div>
                <div className={`px-4 py-3 rounded-2xl text-sm ${
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

      <form onSubmit={handleSend} className="pt-4 border-t border-gray-200 flex gap-3">
        <input
          type="text"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !newMessage.trim()}>
          {sending ? 'Sending...' : 'Send'}
        </Button>
      </form>
    </div>
  );
};

interface CommunicationsViewProps {
  activeTab?: CommsTabType;
  onTabChange?: (tab: CommsTabType) => void;
}

const CommunicationsView: React.FC<CommunicationsViewProps> = ({ activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<CommsTabType>('conversations');
  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = (tab: CommsTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

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

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'conversation:new' || data.event === 'message:new') {
          loadConversations();
        }
      } catch {}
    };

    return () => ws.close();
  }, [loadConversations]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/conversations/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      loadConversations();
      if (selectedConversation?.id === id) {
        setSelectedConversation(prev => prev ? { ...prev, status } : null);
      }
    } catch {}
  };

  const tabBar = (
    <div className="flex gap-1 border-b border-gray-200">
      {(['conversations', 'notifications'] as const).map(t => (
        <button
          key={t}
          type="button"
          onClick={() => { setActiveTab(t); setSelectedConversation(null); }}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-colors capitalize ${
            activeTab === t
              ? 'text-teal-700 border-teal-600'
              : 'text-gray-400 border-transparent hover:text-gray-600'
          }`}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );

  if (selectedConversation) {
    return (
      <div className="space-y-6">
        {tabBar}
        <ChatThread
          conversation={selectedConversation}
          onBack={() => { setSelectedConversation(null); loadConversations(); }}
          onStatusChange={handleStatusChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tabBar}
      {activeTab === 'notifications' ? (
        <NotificationSender />
      ) : (
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {['all', 'open', 'closed'].map(s => (
              <button
                type="button"
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${
                  statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-400">{total} conversation{total !== 1 ? 's' : ''}</span>
        </div>
        <Button onClick={() => setShowNewModal(true)}>New Conversation</Button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : conversations.length === 0 ? (
        <EmptyState
          title="No Conversations"
          message={statusFilter === 'all' ? "Start a conversation with a customer or driver." : `No ${statusFilter} conversations.`}
        />
      ) : (
        <div className="space-y-2">
          {conversations.map(conv => (
            <Card
              key={conv.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedConversation(conv)}
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
                      {conv.type === 'group' && (
                        <span className="text-[9px] font-black uppercase tracking-widest bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">3-Way</span>
                      )}
                      <StatusBadge status={conv.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {conv.participants.filter(p => p.role !== 'admin').map(p => (
                        <span key={p.id} className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${getTypeColor(p.participant_type)}`}>
                          {p.participant_name || p.role}
                        </span>
                      ))}
                    </div>
                    {conv.last_message && (
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
            </Card>
          ))}
        </div>
      )}

      <NewConversationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={(conv) => {
          setSelectedConversation(conv);
          loadConversations();
        }}
      />
      </div>
      )}
    </div>
  );
};

export default CommunicationsView;
