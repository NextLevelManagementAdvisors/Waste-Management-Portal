import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Provider {
  id: string;
  name: string;
  owner_name: string;
  driver_count: number;
  territory_count: number;
  onboarding_status?: string;
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/admin/providers', { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed to load providers (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        const nextProviders: Provider[] = data.providers || [];
        setProviders(nextProviders);
        setSelectedProviderId((prev) => {
          if (prev && nextProviders.some((p) => p.id === prev)) return prev;
          return nextProviders[0]?.id || null;
        });
      } catch {
        if (!cancelled) {
          setProviders([]);
          setSelectedProviderId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
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
