import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';

interface Conversation {
  id: string;
  subject: string | null;
  status: string;
  message_count: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_type: string;
  sender_name: string;
  body: string;
  created_at: string;
}

const ChatWidget: React.FC<{ userId: string }> = ({ userId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { credentials: 'include' });
      if (res.ok) setConversations(await res.json());
    } catch {}
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations/unread-count', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUnreadTotal(data.count || 0);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, [loadUnread]);

  useEffect(() => {
    if (!isOpen) return;
    loadConversations();
  }, [isOpen, loadConversations]);

  useEffect(() => {
    if (!isOpen) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'message:new') {
          if (selectedConvId && data.data?.conversationId === selectedConvId) {
            setMessages(prev => {
              if (prev.find(m => m.id === data.data.message.id)) return prev;
              return [...prev, data.data.message];
            });
            fetch(`/api/conversations/${selectedConvId}/read`, { method: 'PUT', credentials: 'include' }).catch(() => {});
          }
          loadConversations();
          loadUnread();
        }
      } catch {}
    };

    return () => ws.close();
  }, [isOpen, selectedConvId, loadConversations, loadUnread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = async (convId: string) => {
    setSelectedConvId(convId);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, { credentials: 'include' });
      if (res.ok) setMessages(await res.json());
      fetch(`/api/conversations/${convId}/read`, { method: 'PUT', credentials: 'include' }).catch(() => {});
    } catch {}
    setLoading(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConvId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedConvId}/messages`, {
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
    } catch {}
    setSending(false);
  };

  const handleNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBody.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/conversations/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: newSubject.trim() || 'Support Request', body: newBody.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewForm(false);
        setNewSubject('');
        setNewBody('');
        loadConversations();
        loadMessages(data.conversation.id);
      }
    } catch {}
    setSending(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
            {unreadTotal > 9 ? '9+' : unreadTotal}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <Card className="shadow-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: '500px' }}>
        <div className="bg-teal-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            {selectedConvId && (
              <button onClick={() => { setSelectedConvId(null); setMessages([]); }} className="hover:opacity-80">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <h3 className="text-sm font-black">
              {selectedConvId ? 'Conversation' : 'Messages'}
            </h3>
          </div>
          <button onClick={() => { setIsOpen(false); setSelectedConvId(null); }} className="hover:opacity-80">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {selectedConvId ? (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loading ? (
                <p className="text-sm text-gray-400 text-center py-4">Loading...</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No messages yet</p>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[80%]">
                      <p className="text-[10px] text-gray-400 mb-0.5">
                        {msg.sender_type === 'user' ? 'You' : msg.sender_name}
                      </p>
                      <div className={`px-3 py-2 rounded-2xl text-sm ${
                        msg.sender_type === 'user'
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
            <form onSubmit={handleSend} className="px-4 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
              <Button type="submit" size="sm" disabled={sending || !newMessage.trim()}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-gray-100">
              <Button size="sm" onClick={() => setShowNewForm(true)} className="w-full">New Support Request</Button>
            </div>

            {showNewForm && (
              <div className="p-3 border-b border-gray-100 bg-gray-50">
                <form onSubmit={handleNewConversation} className="space-y-2">
                  <input
                    type="text"
                    value={newSubject}
                    onChange={e => setNewSubject(e.target.value)}
                    placeholder="Subject (optional)"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                  <textarea
                    value={newBody}
                    onChange={e => setNewBody(e.target.value)}
                    placeholder="How can we help you?"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewForm(false)}>Cancel</Button>
                    <Button type="submit" size="sm" disabled={sending || !newBody.trim()}>
                      {sending ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {conversations.length === 0 && !showNewForm ? (
              <div className="text-center py-8 px-4">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm font-bold text-gray-600">No messages yet</p>
                <p className="text-xs text-gray-400 mt-1">Start a conversation with our support team</p>
              </div>
            ) : (
              <div>
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => loadMessages(conv.id)}
                    className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{conv.subject || 'Support'}</p>
                        {conv.last_message && (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{conv.last_message}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {conv.last_message_at && (
                          <span className="text-[10px] text-gray-400">
                            {new Date(conv.last_message_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {parseInt(conv.unread_count) > 0 && (
                          <span className="bg-teal-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ChatWidget;
