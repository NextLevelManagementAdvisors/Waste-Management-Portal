import React, { useState, useEffect, useCallback } from 'react';

// Mock API functions - replace with actual calls to your new endpoints
const api = {
  getPendingSwaps: async () => {
    // return fetch('/api/admin/swaps/pending').then(res => res.json());
    return Promise.resolve({
      swaps: [
        { id: 'swap_1', provider_a_name: "Joe's Trash Service", provider_b_name: 'City Waste Co', location_a_address: '123 Main St', location_b_address: '456 Oak Ave', net_value_change_a: -2.50, status: 'pending' },
        { id: 'swap_2', provider_a_name: "Joe's Trash Service", provider_b_name: 'Green Haulers', location_a_address: '789 Pine St', location_b_address: '101 Maple Dr', net_value_change_a: 1.00, status: 'pending' },
      ]
    });
  },
  generateSwaps: async () => {
    // return fetch('/api/admin/swaps/generate', { method: 'POST' }).then(res => res.json());
    console.log('Generating new swap recommendations...');
    return Promise.resolve({ recommendations: [] });
  },
  decideSwap: async (id: string, decision: 'accepted' | 'rejected') => {
    // return fetch(`/api/admin/swaps/${id}/decision`, { method: 'PUT', body: JSON.stringify({ decision }), headers: {'Content-Type': 'application/json'} }).then(res => res.json());
    console.log(`Submitting decision: ${decision} for swap ${id}`);
    return Promise.resolve({ success: true });
  }
};

export const SwapDashboard: React.FC = () => {
  const [swaps, setSwaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchSwaps = useCallback(() => {
    setLoading(true);
    api.getPendingSwaps()
      .then(data => setSwaps(data.swaps))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSwaps();
  }, [fetchSwaps]);

  const handleGenerate = async () => {
    setGenerating(true);
    await api.generateSwaps();
    setGenerating(false);
    fetchSwaps(); // Refresh the list
  };

  const handleDecision = async (id: string, decision: 'accepted' | 'rejected') => {
    await api.decideSwap(id, decision);
    fetchSwaps(); // Refresh the list
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
      {loading ? (
        <p>Loading swaps...</p>
      ) : (
        <div className="space-y-4">
          {swaps.map(swap => (
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
                    <div className={`text-sm font-bold ${swap.net_value_change_a > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Net for {swap.provider_a_name}: ${swap.net_value_change_a.toFixed(2)}
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
                  onClick={() => handleDecision(swap.id, 'rejected')}
                  className="px-3 py-1 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleDecision(swap.id, 'accepted')}
                  className="px-3 py-1 text-sm font-semibold text-white bg-green-600 border border-green-600 rounded-md hover:bg-green-700"
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
