import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/Card.tsx';
import { Button } from '../../components/Button.tsx';

interface AssignmentRequest {
  id: string;
  location_address: string;
  zone_name: string;
  requested_by_name: string;
  deadline: string;
  created_at: string;
}

const relativeTime = (dateStr: string) => {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms < 0) return 'expired';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'less than 1 hour';
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''}`;
};

const ZoneAssignmentRequests: React.FC = () => {
  const [requests, setRequests] = useState<AssignmentRequest[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNotes, setDenyNotes] = useState('');

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/team/zone-assignment-requests', { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setRequests(j.requests || []);
      }
    } catch {}
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleRespond = async (id: string, decision: 'approved' | 'denied', notes?: string) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/team/zone-assignment-requests/${id}/respond`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, notes }),
      });
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.id !== id));
        setDenyingId(null);
        setDenyNotes('');
      }
    } catch {}
    setProcessing(null);
  };

  if (requests.length === 0) return null;

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
        <h3 className="text-lg font-bold text-gray-900">Zone Assignment Requests</h3>
        <span className="ml-auto bg-amber-100 text-amber-700 text-xs font-black px-2 py-0.5 rounded-full">
          {requests.length}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        An admin has requested you add the following location(s) to your zone.
      </p>
      <div className="space-y-3">
        {requests.map(req => {
          const isDenying = denyingId === req.id;
          const isProcessing = processing === req.id;
          return (
            <div key={req.id} className="border border-gray-200 rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{req.location_address}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Zone: <span className="font-bold text-gray-700">{req.zone_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Requested by: {req.requested_by_name}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-amber-600">
                    {relativeTime(req.deadline)} left
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(req.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {!isDenying ? (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Button
                    size="sm"
                    onClick={() => handleRespond(req.id, 'approved')}
                    disabled={isProcessing}
                  >
                    {isProcessing ? '...' : 'Approve'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setDenyingId(req.id)}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              ) : (
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <input
                    type="text"
                    value={denyNotes}
                    onChange={e => setDenyNotes(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-300"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespond(req.id, 'denied', denyNotes || undefined)}
                      disabled={isProcessing}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isProcessing ? '...' : 'Confirm Deny'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDenyingId(null); setDenyNotes(''); }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default ZoneAssignmentRequests;
