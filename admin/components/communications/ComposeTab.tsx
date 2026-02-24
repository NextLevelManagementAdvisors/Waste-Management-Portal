import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import RecipientPicker from './RecipientPicker.tsx';

interface Template {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
}

interface Recipient {
  id: string;
  type: string;
  name: string;
  email?: string;
  phone?: string;
}

const ComposeTab: React.FC<{ onSent?: () => void }> = ({ onSent }) => {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/templates', { credentials: 'include' })
      .then(r => r.json()).then(data => setTemplates(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tmpl = templates.find(t => t.id === templateId);
    if (tmpl) {
      setBody(tmpl.body);
      if (tmpl.subject) setSubject(tmpl.subject);
      if (tmpl.channel === 'sms') setChannel('sms');
      else if (tmpl.channel === 'both') setChannel('both');
      else setChannel('email');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recipients.length === 0 || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipientIds: recipients.map(r => ({ id: r.id, type: r.type })),
          channel,
          subject: channel !== 'sms' ? subject.trim() : undefined,
          body: body.trim(),
          templateId: selectedTemplateId || undefined,
          scheduledFor: scheduleEnabled && scheduledFor ? scheduledFor : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        const msg = scheduleEnabled
          ? `Scheduled ${json.scheduled} message(s)`
          : `Sent to ${json.sent} recipient(s)${json.failed ? `, ${json.failed} failed` : ''}`;
        setResult({ success: true, message: msg });
        setRecipients([]);
        setBody('');
        setSubject('');
        setSelectedTemplateId('');
        setScheduleEnabled(false);
        setScheduledFor('');
      } else {
        setResult({ success: false, message: json.error || 'Failed to send' });
      }
    } catch {
      setResult({ success: false, message: 'Failed to send messages' });
    } finally {
      setSending(false);
    }
  };

  const channelOptions = [
    { value: 'email', label: 'Email', icon: '📧' },
    { value: 'sms', label: 'SMS', icon: '💬' },
    { value: 'both', label: 'Email + SMS', icon: '📨' },
  ] as const;

  return (
    <div className="max-w-3xl">
      <Card className="p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6">Compose Message</h3>

        <form onSubmit={handleSend} className="space-y-5">
          {/* Recipients */}
          <RecipientPicker selected={recipients} onChange={setRecipients} />

          {/* Channel */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Channel</label>
            <div className="flex gap-2">
              {channelOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChannel(opt.value)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                    channel === opt.value
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {channel !== 'email' && (
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 px-3 py-2 rounded-lg">SMS will only be sent to recipients who have a phone number on file.</p>
            )}
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Template (optional)</label>
            <select
              value={selectedTemplateId}
              onChange={e => handleTemplateSelect(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            >
              <option value="">No template - write custom message</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>
              ))}
            </select>
          </div>

          {/* Subject (email only) */}
          {channel !== 'sms' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          )}

          {/* Message Body */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              placeholder="Type your message..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              {channel !== 'email' && (
                <p className={`text-xs ${body.length > 160 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {body.length}/160 characters (SMS best practice)
                </p>
              )}
              {selectedTemplateId && (
                <p className="text-xs text-gray-400">
                  Variables: {'{'}{'{'} customer_name {'}'}{'}'}, {'{'}{'{'} pickup_date {'}'}{'}'}, etc. will be replaced per recipient
                </p>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={e => setScheduleEnabled(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-bold text-gray-700">Schedule for later</span>
            </label>
            {scheduleEnabled && (
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={e => setScheduledFor(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            )}
          </div>

          {/* Result */}
          {result && (
            <div className={`p-3 rounded-lg text-sm font-bold ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {result.message}
              {result.success && onSent && (
                <button type="button" onClick={onSent} className="ml-3 underline text-green-600 hover:text-green-700">View Activity Log</button>
              )}
            </div>
          )}

          {/* Send Button */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button type="submit" disabled={sending || recipients.length === 0 || !body.trim() || (scheduleEnabled && !scheduledFor)} className="flex-1">
              {sending ? 'Sending...' : scheduleEnabled ? `Schedule for ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}` : `Send to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default ComposeTab;
