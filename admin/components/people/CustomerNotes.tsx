import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/Button.tsx';
import type { CustomerNote } from '../../../shared/types/index.ts';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const CustomerNotes: React.FC<{ customerId: string }> = ({ customerId }) => {
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

export default CustomerNotes;
