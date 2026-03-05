import React, { useEffect, useMemo, useState } from 'react';
import { OnboardingWizard } from '../onboarding/OnboardingWizard';

interface Provider {
  id: string;
  name: string;
  owner_name?: string | null;
  owner_email?: string | null;
  driver_count?: number;
  territory_count?: number;
  onboarding_status?: string;
  status?: string;
}

interface Territory {
  id: string;
  name: string;
  zone_type: string;
  status: string;
  default_pickup_day?: string | null;
  color?: string;
}

interface CreateTerritoryInput {
  name: string;
  zone_type: 'polygon' | 'zip';
  zip_codes?: string[];
  default_pickup_day?: string | null;
  color?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed (${res.status})`);
  }
  return res.json();
}

export const TerritoryManager: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingTerritories, setLoadingTerritories] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingTerritory, setCreatingTerritory] = useState(false);

  const [newTerritory, setNewTerritory] = useState<CreateTerritoryInput>({
    name: '',
    zone_type: 'polygon',
    zip_codes: [],
    default_pickup_day: null,
    color: '#3B82F6',
  });
  const [zipCodesInput, setZipCodesInput] = useState('');

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) || null,
    [providers, selectedProviderId]
  );

  const loadProviders = async () => {
    setLoadingProviders(true);
    setError(null);
    try {
      const data = await fetchJson<{ providers: Provider[] }>('/api/admin/providers');
      const nextProviders = data.providers || [];
      setProviders(nextProviders);
      setSelectedProviderId((prev) => {
        if (prev && nextProviders.some((p) => p.id === prev)) return prev;
        return nextProviders[0]?.id || null;
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load providers.');
    } finally {
      setLoadingProviders(false);
    }
  };

  const loadTerritories = async (providerId: string) => {
    setLoadingTerritories(true);
    setError(null);
    try {
      const data = await fetchJson<{ territories: Territory[] }>(`/api/admin/providers/${providerId}/territories`);
      setTerritories(data.territories || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load territories.');
      setTerritories([]);
    } finally {
      setLoadingTerritories(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    if (selectedProviderId) {
      loadTerritories(selectedProviderId);
    } else {
      setTerritories([]);
    }
  }, [selectedProviderId]);

  const handleCreateTerritory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProviderId || !newTerritory.name.trim()) return;

    setCreatingTerritory(true);
    setError(null);
    try {
      const payload: any = {
        name: newTerritory.name.trim(),
        zone_type: newTerritory.zone_type,
        color: newTerritory.color || '#3B82F6',
      };
      if (newTerritory.default_pickup_day) payload.default_pickup_day = newTerritory.default_pickup_day;
      const zipCodes = zipCodesInput
        .split(',')
        .map((z) => z.trim())
        .filter(Boolean);
      if (newTerritory.zone_type === 'zip' && zipCodes.length > 0) {
        payload.zip_codes = zipCodes;
      }
      await fetchJson<{ territory: Territory }>(`/api/admin/providers/${selectedProviderId}/territories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setNewTerritory({
        name: '',
        zone_type: 'polygon',
        zip_codes: [],
        default_pickup_day: null,
        color: '#3B82F6',
      });
      setZipCodesInput('');
      await Promise.all([loadTerritories(selectedProviderId), loadProviders()]);
    } catch (err: any) {
      setError(err?.message || 'Failed to create territory.');
    } finally {
      setCreatingTerritory(false);
    }
  };

  if (loadingProviders) {
    return <div className="text-sm text-gray-500">Loading providers...</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <section className="bg-white rounded-lg border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Providers</h2>
        </div>
        {providers.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No providers found.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {providers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedProviderId(p.id)}
                  className={`w-full text-left p-4 hover:bg-gray-50 ${
                    selectedProviderId === p.id ? 'bg-green-50 border-l-4 border-green-500' : ''
                  }`}
                >
                  <div className="font-bold text-gray-800">{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {p.driver_count || 0} drivers, {p.territory_count || 0} territories
                  </div>
                  {p.onboarding_status && p.onboarding_status !== 'active' && (
                    <div className="mt-1 text-[11px] font-semibold text-amber-700">
                      Onboarding: {p.onboarding_status.replace(/_/g, ' ')}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}

        {selectedProvider && selectedProvider.onboarding_status && selectedProvider.onboarding_status !== 'active' && (
          <OnboardingWizard
            key={selectedProvider.id}
            providerId={selectedProvider.id}
            providerName={selectedProvider.name}
            initialStatus={selectedProvider.onboarding_status}
            onStatusChanged={() => {
              loadProviders();
              if (selectedProviderId) loadTerritories(selectedProviderId);
            }}
          />
        )}

        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-800">Territories</h3>
          </div>
          {loadingTerritories ? (
            <p className="p-4 text-sm text-gray-500">Loading territories...</p>
          ) : territories.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No territories found for this provider.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {territories.map((t) => (
                <li key={t.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-800">{t.name}</div>
                    <div className="text-xs text-gray-500 capitalize">
                      {t.zone_type} {t.default_pickup_day ? `• ${t.default_pickup_day}` : ''}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                      t.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedProviderId && (
          <form onSubmit={handleCreateTerritory} className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-800">Add Territory</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={newTerritory.name}
                onChange={(e) => setNewTerritory((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Territory name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                required
              />
              <select
                value={newTerritory.zone_type}
                onChange={(e) => setNewTerritory((prev) => ({ ...prev, zone_type: e.target.value as 'polygon' | 'zip' }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="polygon">Polygon</option>
                <option value="zip">ZIP</option>
              </select>
            </div>
            {newTerritory.zone_type === 'zip' && (
              <input
                value={zipCodesInput}
                onChange={(e) => setZipCodesInput(e.target.value)}
                placeholder="ZIP codes, comma-separated"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={newTerritory.default_pickup_day || ''}
                onChange={(e) =>
                  setNewTerritory((prev) => ({ ...prev, default_pickup_day: e.target.value || null }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">Default pickup day (optional)</option>
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
                <option value="sunday">Sunday</option>
              </select>
              <input
                type="color"
                value={newTerritory.color || '#3B82F6'}
                onChange={(e) => setNewTerritory((prev) => ({ ...prev, color: e.target.value }))}
                className="h-10 w-full border border-gray-300 rounded-md bg-white"
                title="Territory color"
              />
              <button
                type="submit"
                disabled={creatingTerritory}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-60 text-sm font-semibold"
              >
                {creatingTerritory ? 'Saving...' : 'Create Territory'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};
