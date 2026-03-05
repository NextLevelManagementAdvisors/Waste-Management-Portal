import React from 'react';

interface TerritoryStepProps {
  providerId: string;
  onComplete: () => void;
  onTerritoryCreated?: () => void;
}

export const TerritoryStep: React.FC<TerritoryStepProps> = ({ providerId, onComplete, onTerritoryCreated }) => {
  const [name, setName] = React.useState('');
  const [zoneType, setZoneType] = React.useState<'polygon' | 'zip'>('polygon');
  const [zipCodesInput, setZipCodesInput] = React.useState('');
  const [defaultPickupDay, setDefaultPickupDay] = React.useState('');
  const [color, setColor] = React.useState('#3B82F6');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: any = {
        name: name.trim(),
        zone_type: zoneType,
        color,
      };
      if (defaultPickupDay) payload.default_pickup_day = defaultPickupDay;
      if (zoneType === 'zip') {
        const zipCodes = zipCodesInput
          .split(',')
          .map((z) => z.trim())
          .filter(Boolean);
        if (zipCodes.length > 0) payload.zip_codes = zipCodes;
      }
      const res = await fetch(`/api/admin/providers/${providerId}/territories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Failed to create territory (${res.status})`);
      }
      onTerritoryCreated?.();
      onComplete();
    } catch (err: any) {
      setError(err?.message || 'Failed to create territory.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <h1 className="text-2xl font-bold mb-2">Define Your Service Territory</h1>
      <p className="text-gray-600 mb-6">
        Create your first service territory. You can add additional territories later in provider settings.
      </p>

      <div className="mb-4">
        <label htmlFor="territoryName" className="block text-sm font-medium text-gray-700 mb-1">
          Territory Name
        </label>
        <input
          type="text"
          id="territoryName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          placeholder="e.g., North County"
          required
        />
      </div>

      <div className="mb-4">
        <label htmlFor="zoneType" className="block text-sm font-medium text-gray-700 mb-1">
          Territory Type
        </label>
        <select
          id="zoneType"
          value={zoneType}
          onChange={(e) => setZoneType(e.target.value as 'polygon' | 'zip')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="polygon">Polygon</option>
          <option value="zip">ZIP codes</option>
        </select>
      </div>

      {zoneType === 'zip' && (
        <div className="mb-4">
          <label htmlFor="zipCodes" className="block text-sm font-medium text-gray-700 mb-1">
            ZIP Codes
          </label>
          <input
            type="text"
            id="zipCodes"
            value={zipCodesInput}
            onChange={(e) => setZipCodesInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., 22630, 22655"
          />
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="pickupDay" className="block text-sm font-medium text-gray-700 mb-1">
          Default Pickup Day (optional)
        </label>
        <select
          id="pickupDay"
          value={defaultPickupDay}
          onChange={(e) => setDefaultPickupDay(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Not set</option>
          <option value="monday">Monday</option>
          <option value="tuesday">Tuesday</option>
          <option value="wednesday">Wednesday</option>
          <option value="thursday">Thursday</option>
          <option value="friday">Friday</option>
          <option value="saturday">Saturday</option>
          <option value="sunday">Sunday</option>
        </select>
      </div>

      <div className="mb-6">
        <label htmlFor="territoryColor" className="block text-sm font-medium text-gray-700 mb-1">
          Territory Color
        </label>
        <input
          id="territoryColor"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-full border border-gray-300 rounded-md bg-white"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-semibold"
      >
        {loading ? 'Saving...' : 'Save Territory and Continue'}
      </button>
    </form>
  );
};
