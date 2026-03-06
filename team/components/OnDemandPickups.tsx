import React, { useState, useEffect, useCallback } from 'react';

interface OnDemandPickup {
  id: string;
  address: string;
  serviceName: string;
  servicePrice: number;
  requestedDate: string;
  pickupDate?: string;
  status: string;
  notes?: string;
  photos?: string[];
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return 'Date unavailable';
  const parsed = new Date(dateStr + 'T00:00:00Z');
  if (Number.isNaN(parsed.getTime())) {
    return dateStr;
  }
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

const OnDemandPickups: React.FC = () => {
  const [requests, setRequests] = useState<OnDemandPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/team/on-demand', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setRequests(json.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch on-demand pickups:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleComplete = async (id: string) => {
    if (!confirm('Mark this on-demand pickup as completed?')) return;
    setCompleting(id);
    try {
      const res = await fetch(`/api/team/on-demand/${id}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        await fetchRequests();
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to complete on-demand pickup');
      }
    } catch {
      alert('Failed to complete on-demand pickup');
    } finally {
      setCompleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
      </div>
    );
  }

  // Group by date
  const today = new Date().toISOString().split('T')[0];
  const requestDate = (r: OnDemandPickup) => (r.requestedDate || r.pickupDate || '').split('T')[0];
  const todayRequests = requests.filter(r => requestDate(r) === today);
  const upcomingRequests = requests.filter(r => requestDate(r) > today);
  const pastRequests = requests.filter(r => requestDate(r) < today);

  const renderRequestCard = (request: OnDemandPickup) => (
    <div key={request.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest">{request.serviceName}</p>
          <p className="text-sm font-bold text-gray-900 mt-1">{request.address}</p>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(request.requestedDate || request.pickupDate || '')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${STATUS_COLORS[request.status] || STATUS_COLORS.pending}`}>
            {request.status}
          </span>
          <span className="text-lg font-black text-gray-900">${Number(request.servicePrice || 0).toFixed(2)}</span>
        </div>
      </div>

      {/* Customer Notes */}
      {request.notes && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Customer Notes</p>
          <p className="text-sm text-gray-700">{request.notes}</p>
        </div>
      )}

      {/* Photos */}
      {request.photos && request.photos.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>
          <div className="flex flex-wrap gap-2">
            {request.photos.map((url, i) => (
              <button type="button" key={i} onClick={() => setLightboxPhoto(url)} className="w-16 h-16 rounded-lg overflow-hidden border-2 border-gray-200 hover:border-teal-500 transition-colors" title="View full size">
                <img src={url} alt={`Item ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Complete Button */}
      {(request.status === 'scheduled' || request.status === 'pending') && (
        <button
          type="button"
          onClick={() => handleComplete(request.id)}
          disabled={completing === request.id}
          className="w-full mt-2 px-4 py-3 bg-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {completing === request.id ? 'Completing...' : 'Mark as Completed'}
        </button>
      )}
    </div>
  );

  if (requests.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 font-bold text-sm uppercase tracking-widest">No on-demand pickups assigned to you</p>
        <p className="text-gray-400 text-sm mt-2">When an admin assigns you an on-demand pickup, it will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {todayRequests.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">Today</h3>
          <div className="space-y-3">{todayRequests.map(renderRequestCard)}</div>
        </div>
      )}
      {upcomingRequests.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Upcoming</h3>
          <div className="space-y-3">{upcomingRequests.map(renderRequestCard)}</div>
        </div>
      )}
      {pastRequests.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Past Due</h3>
          <div className="space-y-3">{pastRequests.map(renderRequestCard)}</div>
        </div>
      )}

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setLightboxPhoto(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <img src={lightboxPhoto} alt="Full size" className="relative max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default OnDemandPickups;
