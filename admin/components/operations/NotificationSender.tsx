import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';

const NotificationSender: React.FC = () => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [notificationType, setNotificationType] = useState('pickup_reminder');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/customers', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setCustomers(data.customers || data))
      .catch(console.error);
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: selectedCustomerId, type: notificationType, message }),
      });
      const json = await res.json();
      setResult({ success: res.ok, message: res.ok ? 'Notification sent successfully!' : (json.error || 'Failed to send') });
      if (res.ok) setMessage('');
    } catch {
      setResult({ success: false, message: 'Failed to send notification' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6">Send Notification</h3>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Customer</label>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              required
            >
              <option value="">Select a customer...</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Notification Type</label>
            <select
              value={notificationType}
              onChange={e => setNotificationType(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="pickup_reminder">Pickup Reminder</option>
              <option value="billing_alert">Billing Alert</option>
              <option value="service_update">Service Update</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Message (optional)</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              placeholder="Additional details..."
            />
          </div>
          {result && (
            <div className={`p-3 rounded-lg text-sm font-bold ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {result.message}
            </div>
          )}
          <Button type="submit" disabled={sending || !selectedCustomerId}>
            {sending ? 'Sending...' : 'Send Notification'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default NotificationSender;
