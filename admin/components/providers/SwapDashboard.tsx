import React, { useState, useEffect, useCallback } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { toSwapAmount } from './swapAmounts.ts';

const api = {
  getPendingSwaps: async () => {
    const res = await fetch('/api/admin/swaps/pending', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch pending swaps');
    return res.json();
  },
  generateSwaps: async () => {
    const res = await fetch('/api/admin/swaps/generate', { method: 'POST', credentials: 'include' });
    if (!res.ok) throw new Error('Failed to generate swaps');
    return res.json();
  },
  decideSwap: async (id: string, decision: 'accepted' | 'rejected') => {
    const res = await fetch(`/api/admin/swaps/${id}/decision`, {
      method: 'PUT',
      body: JSON.stringify({ decision }),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to submit decision');
    return res.json();
  },
};

export const SwapDashboard: React.FC = () => {
  const [swaps, setSwaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState<{ id: string; decision: 'accepted' | 'rejected' } | null>(null);
  const [deciding, setDeciding] = useState(false);

  const fetchSwaps = useCallback(() => {
    setLoading(true);
    setError('');
    api.getPendingSwaps()
      .then(data => setSwaps(data.swaps))
      .catch(() => setError('Failed to load swap recommendations.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSwaps();
  }, [fetchSwaps]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      await api.generateSwaps();
      fetchSwaps();
    } catch {
      setError('Failed to generate swap recommendations.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDecision = async () => {
    if (!confirmState) return;
    setDeciding(true);
    try {
      await api.decideSwap(confirmState.id, confirmState.decision);
      setConfirmState(null);
      fetchSwaps();
    } catch {
      setError(`Failed to ${confirmState.decision === 'accepted' ? 'accept' : 'reject'} swap.`);
      setConfirmState(null);
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Swap Recommendations</h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
        >
          {generating ? 'Generating...' : 'Generate New Swaps'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-3 font-bold">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {swaps.map(swap => {
            const netValueChangeA = toSwapAmount(swap.net_value_change_a);

            return (
              <div key={swap.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="grid grid-cols-3 items-center gap-4">
                  {/* Provider A gives */}
                  <div className="text-center">
                    <div className="text-sm font-semibold text-gray-500">{swap.provider_a_name} gives:</div>
                    <div className="text-md font-bold text-gray-800">{swap.location_a_address}</div>
                  </div>

                  {/* Swap Icon & Value */}
                  <div className="text-center">
                    <svg className="w-8 h-8 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4-4 4m0 6H4m0 0l4 4m-4-4 4-4" />
                    </svg>
                    <div className={`text-sm font-bold ${netValueChangeA > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Net for {swap.provider_a_name}: ${netValueChangeA.toFixed(2)}
                    </div>
                  </div>

                  {/* Provider B gives */}
                  <div className="text-center">
                    <div className="text-sm font-semibold text-gray-500">{swap.provider_b_name} gives:</div>
                    <div className="text-md font-bold text-gray-800">{swap.location_b_address}</div>
                  </div>
                </div>
                <div className="flex justify-end items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setConfirmState({ id: swap.id, decision: 'rejected' })}
                    className="px-3 py-1 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setConfirmState({ id: swap.id, decision: 'accepted' })}
                    className="px-3 py-1 text-sm font-semibold text-white bg-green-600 border border-green-600 rounded-md hover:bg-green-700"
                  >
                    Accept
                  </button>
                </div>
              </div>
            );
          })}
          {swaps.length === 0 && (
            <div className="text-center py-8 bg-white rounded-lg border border-dashed">
                <p className="text-gray-500">No pending swap recommendations.</p>
                <p className="text-sm text-gray-400 mt-1">Click "Generate New Swaps" to analyze territories.</p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.decision === 'accepted' ? 'Accept Territory Swap' : 'Reject Territory Swap'}
        message={confirmState?.decision === 'accepted'
          ? 'This will reassign the territories between both providers. This action cannot be undone.'
          : 'This will permanently reject this swap recommendation. This action cannot be undone.'}
        confirmLabel={confirmState?.decision === 'accepted' ? 'Accept Swap' : 'Reject Swap'}
        isDangerous={confirmState?.decision === 'rejected'}
        onConfirm={handleDecision}
        onCancel={() => setConfirmState(null)}
        isLoading={deciding}
      />
    </div>
  );
};
