import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';

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

export default CustomerCommunicationsTab;
