import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../../components/Button.tsx';

interface UserStory {
  id: string;
  section: string;
  text: string;
}

interface FixContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (adminNotes: string, flaggedStories: string[]) => void;
  fixing: boolean;
}

const FixContextModal: React.FC<FixContextModalProps> = ({ isOpen, onClose, onSubmit, fixing }) => {
  const [notes, setNotes] = useState('');
  const [stories, setStories] = useState<UserStory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loadingStories, setLoadingStories] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setSelected(new Set());
      setSearch('');
      setLoadingStories(true);
      fetch('/api/admin/user-stories', { credentials: 'include' })
        .then(r => r.ok ? r.json() : { stories: [] })
        .then(data => setStories(data.stories ?? []))
        .catch(() => {})
        .finally(() => setLoadingStories(false));
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stories;
    const q = search.toLowerCase();
    return stories.filter(s =>
      s.id.toLowerCase().includes(q) ||
      s.text.toLowerCase().includes(q) ||
      s.section.toLowerCase().includes(q)
    );
  }, [stories, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-black text-gray-900">Fix Errors</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Additional Context <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="E.g. 'The sidebar route changed last deploy' or 'API returns 500 when user has no subscriptions'..."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              Flag User Stories <span className="text-gray-400 normal-case tracking-normal">(optional — check stories the platform isn't following)</span>
            </label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search stories by ID, text, or section..."
              className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 mb-2"
            />

            {selected.size > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {Array.from(selected).map(id => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg px-2 py-0.5 text-xs font-bold hover:bg-teal-100"
                  >
                    {id} <span className="text-teal-400">&times;</span>
                  </button>
                ))}
              </div>
            )}

            <div className="border border-gray-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-gray-100">
              {loadingStories ? (
                <div className="p-4 text-center text-sm text-gray-400">Loading stories...</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-400">
                  {search ? 'No stories match your search' : 'No user stories found'}
                </div>
              ) : (
                filtered.map(story => (
                  <label
                    key={story.id}
                    className={`flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${selected.has(story.id) ? 'bg-teal-50/50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(story.id)}
                      onChange={() => toggle(story.id)}
                      className="mt-1 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-500">{story.id}</span>
                        <span className="text-xs text-gray-400">{story.section}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-snug">{story.text}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={() => onSubmit('', [])}
            disabled={fixing}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Skip &mdash; fix without context
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSubmit(notes.trim(), Array.from(selected))}
            disabled={fixing}
          >
            {fixing ? (
              <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Fixing...</>
            ) : (
              'Fix Errors'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FixContextModal;
