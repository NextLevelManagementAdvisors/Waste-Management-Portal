import React, { useState, useEffect, useCallback } from 'react';

interface ConnectionStatus {
  success: boolean;
  message?: string;
  error?: string;
  date?: string;
  routeCount?: number;
  drivers?: { serial: string; name: string }[];
  locations?: { address: string; name?: string }[];
}

const OptimoStatusBanner: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const testConnection = useCallback(async () => {
    setTestingConnection(true);
    try {
      const res = await fetch('/api/admin/optimoroute/test-connection', { credentials: 'include' });
      const data = await res.json();
      setConnectionStatus(data);
    } catch {
      setConnectionStatus({ success: false, error: 'Network error — could not reach server' });
    } finally {
      setTestingConnection(false);
    }
  }, []);

  useEffect(() => { testConnection(); }, [testConnection]);

  if (!connectionStatus) return null;

  return (
    <div className={`rounded-lg border p-3 ${connectionStatus.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${connectionStatus.success ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-sm font-bold ${connectionStatus.success ? 'text-green-700' : 'text-red-700'}`}>
            {connectionStatus.success ? 'OptimoRoute Connected' : 'OptimoRoute Disconnected'}
          </span>
          {connectionStatus.success && (
            <span className="text-xs text-green-600">
              — {connectionStatus.routeCount} route{connectionStatus.routeCount !== 1 ? 's' : ''} today, {connectionStatus.drivers?.length || 0} driver{(connectionStatus.drivers?.length || 0) !== 1 ? 's' : ''}, {connectionStatus.locations?.length || 0} location{(connectionStatus.locations?.length || 0) !== 1 ? 's' : ''}
            </span>
          )}
          {!connectionStatus.success && (
            <span className="text-xs text-red-600">{connectionStatus.error}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connectionStatus.success && (connectionStatus.drivers?.length || 0) > 0 && (
            <button onClick={() => setShowDetails(!showDetails)}
              className="text-xs font-bold text-green-700 hover:text-green-900 transition-colors">
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
          )}
          <button onClick={testConnection} disabled={testingConnection}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">
            {testingConnection ? 'Testing...' : 'Retest'}
          </button>
        </div>
      </div>

      {showDetails && connectionStatus.success && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(connectionStatus.drivers?.length || 0) > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase text-green-600 mb-1">Drivers ({connectionStatus.drivers!.length})</p>
              <div className="bg-white rounded-lg border border-green-100 divide-y divide-green-50">
                {connectionStatus.drivers!.map(d => (
                  <div key={d.serial} className="px-3 py-1.5 flex justify-between">
                    <span className="text-xs font-bold text-gray-900">{d.name}</span>
                    <span className="text-xs text-gray-400 font-mono">{d.serial}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(connectionStatus.locations?.length || 0) > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase text-green-600 mb-1">Locations ({connectionStatus.locations!.length})</p>
              <div className="bg-white rounded-lg border border-green-100 divide-y divide-green-50 max-h-48 overflow-y-auto">
                {connectionStatus.locations!.map((loc, i) => (
                  <div key={i} className="px-3 py-1.5">
                    <span className="text-xs text-gray-900">{loc.address}</span>
                    {loc.name && loc.name !== loc.address && (
                      <span className="text-xs text-gray-400 ml-1">({loc.name})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OptimoStatusBanner;
