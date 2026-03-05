import React, { useCallback, useEffect, useState } from 'react';

interface PendingSwap {
  id: string;
  provider_a_name: string;
  provider_b_name: string;
  location_a_address: string;
  location_b_address: string;
  value_a_to_b_monthly: number;
  value_b_to_a_monthly: number;
  net_value_change_a: number;
  status: 'pending' | 'accepted' | 'rejected';
}

interface GenerateSummary {
  generated: number;
  skippedNoCounterpart: number;
  skippedMissingValue: number;
  skippedOutsideTolerance: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed (${res.status})`);
  }
  return res.json();
}

export const SwapDashboard: React.FC = () => {
  const [swaps, setSwaps] = useState<PendingSwap[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busySwapId, setBusySwapId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<GenerateSummary | null>(null);

  const fetchSwaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ swaps: PendingSwap[] }>('/api/admin/swaps/pending');
      setSwaps(data.swaps || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load pending swaps.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSwaps();
  }, [fetchSwaps]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await fetchJson<{ recommendations: PendingSwap[]; summary?: GenerateSummary }>(
        '/api/admin/swaps/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      setLastSummary(
        data.summary || {
          generated: data.recommendations?.length || 0,
          skippedNoCounterpart: 0,
          skippedMissingValue: 0,
          skippedOutsideTolerance: 0,
        }
      );
      await fetchSwaps();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate swap recommendations.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDecision = async (id: string, decision: 'accepted' | 'rejected') => {
    setBusySwapId(id);
    setError(null);
    try {
      await fetchJson<{ swap: PendingSwap }>(`/api/admin/swaps/${id}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      await fetchSwaps();
    } catch (err: any) {
      setError(err?.message || `Failed to ${decision} swap.`);
    } finally {
      setBusySwapId(null);
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

      {lastSummary && (
        <div className="mb-4 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md p-3">
          Generated: {lastSummary.generated} | Skipped (no counterpart): {lastSummary.skippedNoCounterpart} | Skipped
          (missing value): {lastSummary.skippedMissingValue} | Skipped (outside tolerance): {lastSummary.skippedOutsideTolerance}
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}

      {loading ? (
        <p>Loading swaps...</p>
      ) : (
        <div className="space-y-4">
          {swaps.map((swap) => (
            <div key={swap.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-500">{swap.provider_a_name} gives:</div>
                  <div className="text-md font-bold text-gray-800">{swap.location_a_address}</div>
                  <div className="text-xs text-gray-500 mt-1">${Number(swap.value_a_to_b_monthly || 0).toFixed(2)} / mo</div>
                </div>

                <div className="text-center">
                  <svg className="w-8 h-8 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4-4 4m0 6H4m0 0l4 4m-4-4 4-4" />
                  </svg>
                  <div className={`text-sm font-bold ${swap.net_value_change_a > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Net for {swap.provider_a_name}: ${Number(swap.net_value_change_a || 0).toFixed(2)}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-500">{swap.provider_b_name} gives:</div>
                  <div className="text-md font-bold text-gray-800">{swap.location_b_address}</div>
                  <div className="text-xs text-gray-500 mt-1">${Number(swap.value_b_to_a_monthly || 0).toFixed(2)} / mo</div>
                </div>
              </div>
              <div className="flex justify-end items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleDecision(swap.id, 'rejected')}
                  disabled={busySwapId === swap.id}
                  className="px-3 py-1 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleDecision(swap.id, 'accepted')}
                  disabled={busySwapId === swap.id}
                  className="px-3 py-1 text-sm font-semibold text-white bg-green-600 border border-green-600 rounded-md hover:bg-green-700 disabled:opacity-60"
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
          {swaps.length === 0 && (
            <div className="text-center py-8 bg-white rounded-lg border border-dashed">
              <p className="text-gray-500">No pending swap recommendations.</p>
              <p className="text-sm text-gray-400 mt-1">Click "Generate New Swaps" to analyze territories.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
