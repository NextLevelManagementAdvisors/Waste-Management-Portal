import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Provider {
  id: string;
  name: string;
  owner_name: string;
  driver_count: number;
  territory_count: number;
}

interface ProviderContextType {
  providers: Provider[];
  selectedProvider: Provider | null;
  selectProvider: (id: string | null) => void;
  loading: boolean;
}

const ProviderContext = createContext<ProviderContextType | undefined>(undefined);

export const useProviders = (): ProviderContextType => {
  const context = useContext(ProviderContext);
  if (!context) {
    throw new Error('useProviders must be used within a ProviderProvider');
  }
  return context;
};

interface ProviderProviderProps {
  children: ReactNode;
}

export const ProviderProvider: React.FC<ProviderProviderProps> = ({ children }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // In a real app, you'd fetch this from your API
  useEffect(() => {
    const mockProviders: Provider[] = [
      { id: 'prov_1', name: "Joe's Trash Service", owner_name: 'Joe Smith', driver_count: 2, territory_count: 1 },
      { id: 'prov_2', name: 'City Waste Co', owner_name: 'Jane Doe', driver_count: 10, territory_count: 5 },
      { id: 'prov_3', name: 'Green Haulers', owner_name: 'Al Gore', driver_count: 1, territory_count: 1 },
    ];
    setProviders(mockProviders);
    setLoading(false);
  }, []);

  const selectedProvider = providers.find(p => p.id === selectedProviderId) || null;

  const value = {
    providers,
    selectedProvider,
    selectProvider: setSelectedProviderId,
    loading,
  };

  return (
    <ProviderContext.Provider value={value}>
      {children}
    </ProviderContext.Provider>
  );
};
