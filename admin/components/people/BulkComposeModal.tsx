import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';

interface Template {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
}

interface BulkComposeModalProps {
  recipients: any[];
  onClose: () => void;
  onSent: () => void;
}

const BulkComposeModal: React.FC<BulkComposeModalProps> = ({ recipients: initialRecipients, onClose, onSent }) => {
  const [recipients, setRecipients] = useState(initialRecipients);
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

  useEffect(() => {
    if (recipients.length === 0 && !result) onClose();
  }, [recipients.length, result, onClose]);

  const removeRecipient = (id: string) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

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
          recipientIds: recipients.map(r => ({ id: r.id, type: 'user' })),
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
        setTimeout(() => onSent(), 1500);
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
    { value: 'email', label: 'Email' },
    { value: 'sms', label: 'SMS' },
    { value: 'both', label: 'Email + SMS' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-gray-900">
            Send Message <span className="text-sm font-bold text-gray-400 ml-2">to {recipients.length} {recipients.length === 1 ? 'person' : 'people'}</span>
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Recipient chips */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {recipients.map(r => (
            <span key={r.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
              (r.roles || []).includes('driver') && !(r.roles || []).includes('customer')
                ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {r.firstName} {r.lastName}
              <button type="button" onClick={() => removeRecipient(r.id)} className="text-current hover:opacity-60">&times;</button>
            </span>
          ))}
        </div>

        <form onSubmit={handleSend} className="space-y-5">
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
                  Variables like {'{{'}customer_name{'}}'}  will be replaced per recipient
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
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending || recipients.length === 0 || !body.trim() || (scheduleEnabled && !scheduledFor)}>
              {sending ? 'Sending...' : scheduleEnabled
                ? `Schedule for ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`
                : `Send to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkComposeModal;
