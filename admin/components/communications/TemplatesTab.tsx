import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import TemplateEditorModal from './TemplateEditorModal.tsx';

interface Template {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
  created_at: string;
}

const TemplatesTab: React.FC<{ onUseTemplate?: () => void }> = ({ onUseTemplate }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/templates', { credentials: 'include' });
      if (res.ok) setTemplates(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/admin/templates/${id}`, { method: 'DELETE', credentials: 'include' });
      setDeleteConfirm(null);
      loadTemplates();
    } catch {}
  };

  const channelBadge = (ch: string) => {
    switch (ch) {
      case 'email': return 'bg-blue-100 text-blue-700';
      case 'sms': return 'bg-green-100 text-green-700';
      case 'both': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => { setEditingTemplate(null); setShowEditor(true); }}>New Template</Button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No Templates"
          message="Create reusable message templates for common notifications."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map(tmpl => (
            <Card key={tmpl.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-black text-gray-900">{tmpl.name}</h3>
                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${channelBadge(tmpl.channel)}`}>
                  {tmpl.channel}
                </span>
              </div>
              {tmpl.subject && <p className="text-xs text-gray-500 mb-1">Subject: {tmpl.subject}</p>}
              <p className="text-sm text-gray-600 line-clamp-2 mb-3">{tmpl.body}</p>
              {tmpl.variables?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {tmpl.variables.map(v => (
                    <span key={v} className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      {'{{' + v + '}}'}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setEditingTemplate(tmpl); setShowEditor(true); }}>Edit</Button>
                <Button size="sm" onClick={() => onUseTemplate?.()}>Use</Button>
                {deleteConfirm === tmpl.id ? (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-red-600 font-bold">Delete?</span>
                    <button type="button" onClick={() => handleDelete(tmpl.id)} className="text-xs font-bold text-red-600 hover:text-red-700">Yes</button>
                    <button type="button" onClick={() => setDeleteConfirm(null)} className="text-xs font-bold text-gray-400 hover:text-gray-600">No</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDeleteConfirm(tmpl.id)} className="text-xs font-bold text-gray-400 hover:text-red-500 ml-auto">Delete</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showEditor && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => { setShowEditor(false); setEditingTemplate(null); }}
          onSaved={() => { setShowEditor(false); setEditingTemplate(null); loadTemplates(); }}
        />
      )}
    </div>
  );
};

export default TemplatesTab;
