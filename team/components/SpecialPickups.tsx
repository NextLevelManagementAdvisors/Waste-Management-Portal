import React, { useState, useEffect, useCallback } from 'react';

interface SpecialPickup {
  id: string;
  address: string;
  serviceName: string;
  servicePrice: number;
  pickupDate: string;
  status: string;
  notes?: string;
  photos?: string[];
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

const SpecialPickups: React.FC = () => {
  const [pickups, setPickups] = useState<SpecialPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);

  const fetchPickups = useCallback(async () => {
    try {
      const res = await fetch('/api/team/special-pickups', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setPickups(json.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch special pickups:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPickups(); }, [fetchPickups]);

  const handleComplete = async (id: string) => {
    if (!confirm('Mark this pickup as completed?')) return;
    setCompleting(id);
    try {
      const res = await fetch(`/api/team/special-pickups/${id}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        await fetchPickups();
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to complete pickup');
      }
    } catch {
      alert('Failed to complete pickup');
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
  const todayPickups = pickups.filter(p => p.pickupDate.split('T')[0] === today);
  const upcomingPickups = pickups.filter(p => p.pickupDate.split('T')[0] > today);
  const pastPickups = pickups.filter(p => p.pickupDate.split('T')[0] < today);

  const renderPickupCard = (pickup: SpecialPickup) => (
    <div key={pickup.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest">{pickup.serviceName}</p>
          <p className="text-sm font-bold text-gray-900 mt-1">{pickup.address}</p>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(pickup.pickupDate)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${STATUS_COLORS[pickup.status] || STATUS_COLORS.pending}`}>
            {pickup.status}
          </span>
          <span className="text-lg font-black text-gray-900">${pickup.servicePrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Customer Notes */}
      {pickup.notes && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Customer Notes</p>
          <p className="text-sm text-gray-700">{pickup.notes}</p>
        </div>
      )}

      {/* Photos */}
      {pickup.photos && pickup.photos.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Photos</p>
          <div className="flex flex-wrap gap-2">
            {pickup.photos.map((url, i) => (
              <button type="button" key={i} onClick={() => setLightboxPhoto(url)} className="w-16 h-16 rounded-lg overflow-hidden border-2 border-gray-200 hover:border-teal-500 transition-colors" title="View full size">
                <img src={url} alt={`Item ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Complete Button */}
      {(pickup.status === 'scheduled' || pickup.status === 'pending') && (
        <button
          type="button"
          onClick={() => handleComplete(pickup.id)}
          disabled={completing === pickup.id}
          className="w-full mt-2 px-4 py-3 bg-teal-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {completing === pickup.id ? 'Completing...' : 'Mark as Completed'}
        </button>
      )}
    </div>
  );

  if (pickups.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 font-bold text-sm uppercase tracking-widest">No special pickups assigned to you</p>
        <p className="text-gray-400 text-sm mt-2">When an admin assigns you a special pickup, it will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {todayPickups.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-3">Today</h3>
          <div className="space-y-3">{todayPickups.map(renderPickupCard)}</div>
        </div>
      )}
      {upcomingPickups.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Upcoming</h3>
          <div className="space-y-3">{upcomingPickups.map(renderPickupCard)}</div>
        </div>
      )}
      {pastPickups.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Past Due</h3>
          <div className="space-y-3">{pastPickups.map(renderPickupCard)}</div>
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

export default SpecialPickups;
