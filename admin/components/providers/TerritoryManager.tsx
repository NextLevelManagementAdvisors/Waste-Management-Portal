import React, { useState, useEffect } from 'react';

const api = {
  getProviders: async () => {
    const res = await fetch('/api/admin/providers', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch providers');
    return res.json();
  },
  getTerritories: async (providerId: string) => {
    const res = await fetch(`/api/admin/providers/${providerId}/territories`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch territories');
    return res.json();
  },
};

const ProviderList: React.FC<{ providers: any[], onSelectProvider: (id: string) => void, selectedProviderId: string | null }> = ({ providers, onSelectProvider, selectedProviderId }) => (
  <div className="w-1/3 pr-4">
    <h2 className="text-xl font-semibold mb-2">Providers</h2>
    <div className="bg-white rounded-lg shadow-md">
      <ul className="divide-y divide-gray-200">
        {providers.map(p => (
          <li
            key={p.id}
            onClick={() => onSelectProvider(p.id)}
            className={`p-4 cursor-pointer hover:bg-gray-50 ${selectedProviderId === p.id ? 'bg-green-50 border-l-4 border-green-500' : ''}`}
          >
            <div className="font-bold text-gray-800">{p.name}</div>
            <div className="text-sm text-gray-500">{p.driver_count} drivers, {p.territory_count} territories</div>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

const TerritoryList: React.FC<{ territories: any[] }> = ({ territories }) => (
  <div>
    <h3 className="text-lg font-semibold mb-2">Service Territories</h3>
     <div className="bg-white rounded-lg shadow-md">
        <ul className="divide-y divide-gray-200">
            {territories.map(t => (
            <li key={t.id} className="p-3 flex justify-between items-center">
                <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-gray-500 capitalize">{t.zone_type}</div>
                </div>
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    t.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                {t.status}
                </span>
            </li>
            ))}
            {territories.length === 0 && <li className="p-4 text-center text-gray-500">No territories found.</li>}
        </ul>
     </div>
     <button className="mt-4 w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
        Add New Territory
     </button>
  </div>
);

const MapEditor: React.FC = () => (
    <div className="bg-gray-200 h-full rounded-lg shadow-inner flex items-center justify-center">
        <p className="text-gray-500">Map editor placeholder</p>
    </div>
);


export const TerritoryManager: React.FC = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [territories, setTerritories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProviders().then(data => {
      setProviders(data.providers);
      if (data.providers.length > 0) {
        setSelectedProviderId(data.providers[0].id);
      }
    }).catch(err => {
      console.error('Failed to load providers:', err);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedProviderId) {
      api.getTerritories(selectedProviderId).then(data => {
        setTerritories(data.territories);
      }).catch(err => {
        console.error('Failed to load territories:', err);
        setTerritories([]);
      });
    } else {
      setTerritories([]);
    }
  }, [selectedProviderId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex h-[calc(100vh-12rem)]">
      <ProviderList providers={providers} onSelectProvider={setSelectedProviderId} selectedProviderId={selectedProviderId} />
      <div className="w-2/3 flex flex-col">
        <div className="w-full md:w-1/2 lg:w-1/3 flex-shrink-0 pr-4">
            {selectedProviderId && <TerritoryList territories={territories} />}
        </div>
        <div className="flex-grow h-full mt-4 md:mt-0">
             <MapEditor />
        </div>
      </div>
    </div>
  );
};
