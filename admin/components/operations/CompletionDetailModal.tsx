import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from '../ui/index.ts';

interface CompletionData {
  status?: string;
  startTime?: { localTime?: string };
  endTime?: { localTime?: string };
  form?: {
    note?: string;
    signature?: { type: string; url: string };
    images?: { type: string; url: string }[];
  };
  tracking_url?: string;
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-600',
  scheduled: 'bg-gray-100 text-gray-600',
  on_route: 'bg-blue-100 text-blue-700',
  servicing: 'bg-yellow-100 text-yellow-700',
};

interface CompletionDetailModalProps {
  stopIdentifier: { id?: string; orderNo?: string };
  onClose: () => void;
}

const CompletionDetailModal: React.FC<CompletionDetailModalProps> = ({ stopIdentifier, onClose }) => {
  const [data, setData] = useState<CompletionData | null>(null);
  const [loading, setLoading] = useState(true);

  const label = stopIdentifier.orderNo || stopIdentifier.id || '';

  useEffect(() => {
    const fetchCompletion = async () => {
      setLoading(true);
      try {
        const param = stopIdentifier.id ? `ids=${stopIdentifier.id}` : `orderNos=${stopIdentifier.orderNo}`;
        const res = await fetch(`/api/admin/optimoroute/completion?${param}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          const order = json.orders?.find((o: any) =>
            o.id === stopIdentifier.id || o.orderNo === stopIdentifier.orderNo || o.success
          );
          setData(order?.data || null);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchCompletion();
  }, [stopIdentifier.id, stopIdentifier.orderNo]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-gray-900">Completion Details</h2>
          <button type="button" onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400">Order:</span>
              <span className="font-mono text-sm">{label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400">Status:</span>
              <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[data.status || ''] || 'bg-gray-100 text-gray-600'}`}>
                {data.status || 'Unknown'}
              </span>
            </div>
            {data.startTime && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">Start:</span>
                <span className="text-sm">{data.startTime.localTime || '—'}</span>
              </div>
            )}
            {data.endTime && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400">End:</span>
                <span className="text-sm">{data.endTime.localTime || '—'}</span>
              </div>
            )}
            {data.tracking_url && (
              <a href={data.tracking_url} target="_blank" rel="noopener noreferrer" className="text-sm text-teal-600 hover:underline">
                View Tracking
              </a>
            )}

            {data.form && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <h3 className="text-xs font-black uppercase text-gray-400">Proof of Delivery</h3>
                {data.form.note && (
                  <div>
                    <span className="text-xs font-bold text-gray-400">Note:</span>
                    <p className="text-sm text-gray-700 mt-1">{data.form.note}</p>
                  </div>
                )}
                {data.form.signature && (
                  <div>
                    <span className="text-xs font-bold text-gray-400">Signature:</span>
                    <img src={data.form.signature.url} alt="Signature" className="mt-1 max-h-24 border border-gray-200 rounded-lg" />
                  </div>
                )}
                {data.form.images && data.form.images.length > 0 && (
                  <div>
                    <span className="text-xs font-bold text-gray-400">Photos:</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {data.form.images.map((img, i) => (
                        <a key={i} href={img.url} target="_blank" rel="noopener noreferrer">
                          <img src={img.url} alt={`Photo ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border border-gray-200" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm text-center py-4">No completion data available</p>
        )}
      </div>
    </div>
  );
};

export default CompletionDetailModal;
