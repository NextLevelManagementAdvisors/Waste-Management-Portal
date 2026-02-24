import React, { useState, useRef } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';

interface Template {
  id?: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
}

const AVAILABLE_VARIABLES = [
  'customer_name', 'pickup_date', 'pickup_type', 'property_address',
  'invoice_number', 'amount', 'due_date',
];

const TemplateEditorModal: React.FC<{
  template?: Template | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ template, onClose, onSaved }) => {
  const [name, setName] = useState(template?.name || '');
  const [channel, setChannel] = useState(template?.channel || 'email');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template?.body || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (varName: string) => {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = `{{${varName}}}`;
    const newBody = body.slice(0, start) + text + body.slice(end);
    setBody(newBody);
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    }, 0);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) { setError('Name and body are required'); return; }
    setSaving(true);
    setError('');

    // Extract variables used in body
    const usedVars: string[] = [];
    body.replace(/\{\{(\w+)\}\}/g, (_, v) => { if (!usedVars.includes(v)) usedVars.push(v); return ''; });

    try {
      const url = template?.id ? `/api/admin/templates/${template.id}` : '/api/admin/templates';
      const method = template?.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), channel, subject: subject.trim() || null, body: body.trim(), variables: usedVars }),
      });
      if (!res.ok) { const j = await res.json(); setError(j.error || 'Failed to save'); return; }
      onSaved();
    } catch { setError('Failed to save template'); }
    finally { setSaving(false); }
  };

  // Preview with sample data
  const sampleData: Record<string, string> = {
    customer_name: 'John Smith', pickup_date: 'March 5, 2026', pickup_type: 'Regular',
    property_address: '123 Main St', invoice_number: 'INV-001', amount: '$45.00', due_date: 'March 15, 2026',
  };
  const previewBody = body.replace(/\{\{(\w+)\}\}/g, (m, k) => sampleData[k] || m);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative w-full max-w-3xl p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gray-900 mb-4">{template?.id ? 'Edit Template' : 'New Template'}</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Template Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Late Payment Notice"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Channel</label>
              <select value={channel} onChange={e => setChannel(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="both">Email + SMS</option>
              </select>
            </div>
          </div>

          {channel !== 'sms' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Email Subject</label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line..."
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Message Body</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {AVAILABLE_VARIABLES.map(v => (
                <button key={v} type="button" onClick={() => insertVariable(v)}
                  className="text-xs font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded transition-colors">
                  {'{{' + v + '}}'}
                </button>
              ))}
            </div>
            <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={6}
              placeholder="Type your template message... Use {{variable}} for dynamic content"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none font-mono" />
          </div>

          {/* Preview */}
          {body.trim() && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Preview (with sample data)</label>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap">
                {channel !== 'sms' && subject && <p className="font-bold text-gray-900 mb-2">Subject: {subject.replace(/\{\{(\w+)\}\}/g, (m, k) => sampleData[k] || m)}</p>}
                {previewBody}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim() || !body.trim()} className="flex-1">
              {saving ? 'Saving...' : template?.id ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default TemplateEditorModal;
