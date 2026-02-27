import React, { useState, useEffect } from 'react';

interface Bid {
  id: string;
  driverId: string;
  driverName: string;
  driverRating?: number;
  driverRatingAtBid?: number;
  bidAmount: number;
  message?: string;
  createdAt: string;
}

interface BidSectionProps {
  routeId: string;
  basePay?: number;
  canAcceptBids: boolean;
  onBidAccepted: () => void;
}

const formatDateTime = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
};

const BidSection: React.FC<BidSectionProps> = ({ routeId, basePay, canAcceptBids, onBidAccepted }) => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBids = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/routes/${routeId}/bids`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setBids(data.bids ?? []);
        }
      } catch (e) {
        console.error('Failed to load bids:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchBids();
  }, [routeId]);

  const acceptBid = async (bid: Bid) => {
    try {
      const res = await fetch(`/api/admin/routes/${routeId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ driverId: bid.driverId, bidId: bid.id, actualPay: bid.bidAmount }),
      });
      if (res.ok) onBidAccepted();
    } catch (e) {
      console.error('Failed to accept bid:', e);
    }
  };

  if (loading) return <div className="px-3 py-2 text-xs text-gray-400">Loading bids...</div>;
  if (bids.length === 0) return <div className="px-3 py-2 text-xs text-gray-400">No bids yet</div>;

  return (
    <div className="border-t border-gray-100 bg-gray-50/50">
      <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">
        Bids ({bids.length})
      </div>
      <div className="divide-y divide-gray-100">
        {bids.map(bid => {
          const delta = basePay != null ? bid.bidAmount - basePay : null;
          return (
            <div key={bid.id} className="px-3 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{bid.driverName}</span>
                  {bid.driverRating != null && (
                    <span className="text-xs text-gray-400">{bid.driverRating.toFixed(1)}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">{formatDateTime(bid.createdAt)}</div>
                {bid.message && (
                  <div className="text-xs text-gray-500 italic mt-0.5 truncate" title={bid.message}>"{bid.message}"</div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-semibold text-teal-700">${bid.bidAmount.toFixed(2)}</div>
                {delta != null && delta !== 0 && (
                  <div className={`text-xs ${delta > 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {delta > 0 ? '+' : ''}${delta.toFixed(2)}
                  </div>
                )}
              </div>
              {canAcceptBids && (
                <button type="button" onClick={() => acceptBid(bid)}
                  className="flex-shrink-0 px-3 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
                  Accept
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BidSection;
