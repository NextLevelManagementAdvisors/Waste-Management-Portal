import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';

interface DriverZone {
  id: string;
  name: string;
  description?: string;
  color: string;
  active: boolean;
  driver_count: number;
  property_count: number;
  admin_zone_id?: string;
  admin_zone_name?: string;
}

interface AdminZone {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  driver_zone_count: number;
  total_properties: number;
  total_drivers: number;
  driverZones: { id: string; name: string; color: string; active: boolean }[];
}

interface ZoneDriver {
  id: string;
  name: string;
  email: string;
  phone?: string;
  rating?: number;
  status: string;
  zone_status: string;
}

interface CoverageGaps {
  unassignedProperties: { id: string; address: string; service_type: string; customer_name: string }[];
  emptyZones: { id: string; name: string; color: string; property_count: number }[];
  understaffedZones: { id: string; name: string; color: string; driver_count: number; property_count: number }[];
}

type SubTab = 'driver-zones' | 'admin-zones' | 'coverage-gaps';

const ZonesPanel: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('driver-zones');
  const [driverZones, setDriverZones] = useState<DriverZone[]>([]);
  const [adminZones, setAdminZones] = useState<AdminZone[]>([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGaps | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const [zoneDrivers, setZoneDrivers] = useState<Record<string, ZoneDriver[]>>({});

  // Driver zone form
  const [showDriverZoneForm, setShowDriverZoneForm] = useState(false);
  const [editingDriverZone, setEditingDriverZone] = useState<DriverZone | null>(null);
  const [driverZoneForm, setDriverZoneForm] = useState({ name: '', description: '', color: '#10B981' });

  // Admin zone form
  const [showAdminZoneForm, setShowAdminZoneForm] = useState(false);
  const [editingAdminZone, setEditingAdminZone] = useState<AdminZone | null>(null);
  const [adminZoneForm, setAdminZoneForm] = useState({ name: '', description: '' });
  const [formSaving, setFormSaving] = useState(false);

  // Coverage gap filter
  const [gapFilterZone, setGapFilterZone] = useState<string>('');

  const loadDriverZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/zones', { credentials: 'include' });
      if (res.ok) { const j = await res.json(); setDriverZones(j.zones || []); }
    } catch {}
  }, []);

  const loadAdminZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/admin-zones', { credentials: 'include' });
      if (res.ok) { const j = await res.json(); setAdminZones(j.adminZones || []); }
    } catch {}
  }, []);

  const loadCoverageGaps = useCallback(async (adminZoneId?: string) => {
    try {
      const url = adminZoneId ? `/api/admin/coverage-gaps?adminZoneId=${adminZoneId}` : '/api/admin/coverage-gaps';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) setCoverageGaps(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadDriverZones(), loadAdminZones(), loadCoverageGaps()]);
      setLoading(false);
    };
    load();
  }, [loadDriverZones, loadAdminZones, loadCoverageGaps]);

  const loadZoneDrivers = async (zoneId: string) => {
    if (zoneDrivers[zoneId]) return;
    try {
      const res = await fetch(`/api/admin/zones/${zoneId}/drivers`, { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setZoneDrivers(prev => ({ ...prev, [zoneId]: j.drivers || [] }));
      }
    } catch {}
  };

  const handleExpandZone = (zoneId: string) => {
    if (expandedZone === zoneId) {
      setExpandedZone(null);
    } else {
      setExpandedZone(zoneId);
      loadZoneDrivers(zoneId);
    }
  };

  const handleAssignAdminZone = async (driverZoneId: string, adminZoneId: string | null) => {
    try {
      await fetch(`/api/admin/zones/${driverZoneId}/admin-zone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ adminZoneId }),
      });
      await Promise.all([loadDriverZones(), loadAdminZones()]);
    } catch {}
  };

  const handleToggleZoneActive = async (zone: DriverZone) => {
    try {
      await fetch(`/api/admin/zones/${zone.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: !zone.active }),
      });
      await loadDriverZones();
    } catch {}
  };

  const handleSaveDriverZone = async () => {
    if (!driverZoneForm.name.trim()) return;
    setFormSaving(true);
    try {
      const method = editingDriverZone ? 'PUT' : 'POST';
      const url = editingDriverZone ? `/api/admin/zones/${editingDriverZone.id}` : '/api/admin/zones';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(driverZoneForm),
      });
      if (res.ok) {
        await loadDriverZones();
        setShowDriverZoneForm(false);
        setEditingDriverZone(null);
        setDriverZoneForm({ name: '', description: '', color: '#10B981' });
      }
    } catch {}
    setFormSaving(false);
  };

  const handleDeleteDriverZone = async (id: string) => {
    if (!window.confirm('Delete this driver zone? Drivers will be unlinked.')) return;
    try {
      await fetch(`/api/admin/zones/${id}`, { method: 'DELETE', credentials: 'include' });
      await loadDriverZones();
    } catch {}
  };

  const openEditDriverZone = (zone: DriverZone) => {
    setEditingDriverZone(zone);
    setDriverZoneForm({ name: zone.name, description: zone.description || '', color: zone.color || '#10B981' });
    setShowDriverZoneForm(true);
  };

  const handleSaveAdminZone = async () => {
    if (!adminZoneForm.name.trim()) return;
    setFormSaving(true);
    try {
      const method = editingAdminZone ? 'PUT' : 'POST';
      const url = editingAdminZone ? `/api/admin/admin-zones/${editingAdminZone.id}` : '/api/admin/admin-zones';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(adminZoneForm),
      });
      if (res.ok) {
        await loadAdminZones();
        setShowAdminZoneForm(false);
        setEditingAdminZone(null);
        setAdminZoneForm({ name: '', description: '' });
      }
    } catch {}
    setFormSaving(false);
  };

  const handleDeleteAdminZone = async (id: string) => {
    if (!window.confirm('Deactivate this admin zone? Its driver zones will be unlinked.')) return;
    try {
      await fetch(`/api/admin/admin-zones/${id}`, { method: 'DELETE', credentials: 'include' });
      await Promise.all([loadAdminZones(), loadDriverZones()]);
    } catch {}
  };

  const openEditAdminZone = (az: AdminZone) => {
    setEditingAdminZone(az);
    setAdminZoneForm({ name: az.name, description: az.description || '' });
    setShowAdminZoneForm(true);
  };

  useEffect(() => {
    if (subTab === 'coverage-gaps') loadCoverageGaps(gapFilterZone || undefined);
  }, [subTab, gapFilterZone, loadCoverageGaps]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-2">
        {([
          { key: 'driver-zones' as SubTab, label: 'Driver Zones' },
          { key: 'admin-zones' as SubTab, label: 'Admin Zones' },
          { key: 'coverage-gaps' as SubTab, label: 'Coverage Gaps' },
        ]).map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSubTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              subTab === tab.key
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Driver Zones */}
      {subTab === 'driver-zones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Driver Zones</h3>
              <p className="text-sm text-gray-500">Territories drivers can select to receive route offers.</p>
            </div>
            <button
              type="button"
              onClick={() => { setEditingDriverZone(null); setDriverZoneForm({ name: '', description: '', color: '#10B981' }); setShowDriverZoneForm(true); }}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors"
            >
              + New Zone
            </button>
          </div>

          {showDriverZoneForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h4 className="text-sm font-bold text-gray-900">{editingDriverZone ? 'Edit Driver Zone' : 'Create Driver Zone'}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Name *</label>
                  <input
                    type="text"
                    value={driverZoneForm.name}
                    onChange={e => setDriverZoneForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. North Valley"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={driverZoneForm.color}
                      onChange={e => setDriverZoneForm(p => ({ ...p, color: e.target.value }))}
                      className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">{driverZoneForm.color}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={driverZoneForm.description}
                  onChange={e => setDriverZoneForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowDriverZoneForm(false); setEditingDriverZone(null); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveDriverZone} disabled={formSaving || !driverZoneForm.name.trim()} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 disabled:opacity-50">
                  {formSaving ? 'Saving...' : editingDriverZone ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {driverZones.length === 0 ? (
            <EmptyState message="No driver zones created yet. Click '+ New Zone' to add one." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Zone</th>
                  <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Drivers</th>
                  <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Properties</th>
                  <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Admin Zone</th>
                  <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Status</th>
                  <th className="px-5 py-3 font-bold text-gray-500 text-xs uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {driverZones.map(zone => (
                  <React.Fragment key={zone.id}>
                    <tr
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleExpandZone(zone.id)}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color || '#9CA3AF' }} />
                          <span className="font-bold text-gray-900">{zone.name}</span>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedZone === zone.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`font-bold ${zone.driver_count === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {zone.driver_count}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-700">{zone.property_count}</td>
                      <td className="px-5 py-3">
                        <select
                          title="Assign to admin zone"
                          value={zone.admin_zone_id || ''}
                          onClick={e => e.stopPropagation()}
                          onChange={e => handleAssignAdminZone(zone.id, e.target.value || null)}
                          className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          <option value="">None</option>
                          {adminZones.filter(az => az.active).map(az => (
                            <option key={az.id} value={az.id}>{az.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleToggleZoneActive(zone); }}
                          className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            zone.active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {zone.active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={e => { e.stopPropagation(); openEditDriverZone(zone); }} className="text-xs font-bold text-teal-600 hover:underline">Edit</button>
                          <button type="button" onClick={e => { e.stopPropagation(); handleDeleteDriverZone(zone.id); }} className="text-xs font-bold text-red-500 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                    {expandedZone === zone.id && (
                      <tr>
                        <td colSpan={6} className="bg-gray-50 px-5 py-3">
                          <p className="text-xs font-bold text-gray-500 uppercase mb-2">Assigned Drivers</p>
                          {!zoneDrivers[zone.id] ? (
                            <p className="text-xs text-gray-400">Loading...</p>
                          ) : zoneDrivers[zone.id].length === 0 ? (
                            <p className="text-xs text-gray-400">No drivers assigned to this zone.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {zoneDrivers[zone.id].map(d => (
                                <div key={d.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900 truncate">{d.name}</p>
                                    <p className="text-xs text-gray-500 truncate">{d.email}</p>
                                  </div>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                    d.zone_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {d.zone_status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      )}

      {/* Admin Zones */}
      {subTab === 'admin-zones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Admin Zones</h3>
              <p className="text-sm text-gray-500">Group driver zones into larger operational territories.</p>
            </div>
            <button
              type="button"
              onClick={() => { setEditingAdminZone(null); setAdminZoneForm({ name: '', description: '' }); setShowAdminZoneForm(true); }}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors"
            >
              + New Admin Zone
            </button>
          </div>

          {showAdminZoneForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h4 className="text-sm font-bold text-gray-900">{editingAdminZone ? 'Edit Admin Zone' : 'Create Admin Zone'}</h4>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={adminZoneForm.name}
                  onChange={e => setAdminZoneForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. North Region"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={adminZoneForm.description}
                  onChange={e => setAdminZoneForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowAdminZoneForm(false); setEditingAdminZone(null); }} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveAdminZone} disabled={formSaving || !adminZoneForm.name.trim()} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 disabled:opacity-50">
                  {formSaving ? 'Saving...' : editingAdminZone ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {adminZones.length === 0 ? (
            <EmptyState message="No admin zones created yet." />
          ) : (
            <div className="space-y-3">
              {adminZones.map(az => (
                <div key={az.id} className={`bg-white rounded-xl border ${az.active ? 'border-gray-200' : 'border-gray-100 opacity-60'} p-5`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-gray-900">{az.name}</h4>
                      {az.description && <p className="text-sm text-gray-500 mt-0.5">{az.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEditAdminZone(az)} className="text-xs font-bold text-teal-600 hover:underline">Edit</button>
                      {az.active && (
                        <button type="button" onClick={() => handleDeleteAdminZone(az.id)} className="text-xs font-bold text-red-500 hover:underline">Deactivate</button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm mb-3">
                    <span className="text-gray-500"><span className="font-bold text-gray-900">{az.driver_zone_count}</span> driver zones</span>
                    <span className="text-gray-500"><span className="font-bold text-gray-900">{az.total_properties}</span> properties</span>
                    <span className="text-gray-500"><span className="font-bold text-gray-900">{az.total_drivers}</span> active drivers</span>
                  </div>
                  {az.driverZones.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {az.driverZones.map(dz => (
                        <span key={dz.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dz.color || '#9CA3AF' }} />
                          {dz.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coverage Gaps */}
      {subTab === 'coverage-gaps' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">Coverage Gaps</h3>
              <p className="text-sm text-gray-500">Identify unassigned properties and understaffed zones.</p>
            </div>
            <select
              title="Filter by admin zone"
              value={gapFilterZone}
              onChange={e => setGapFilterZone(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">All admin zones</option>
              {adminZones.filter(az => az.active).map(az => (
                <option key={az.id} value={az.id}>{az.name}</option>
              ))}
            </select>
          </div>

          {!coverageGaps ? (
            <LoadingSpinner />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Unassigned Properties */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900">Unassigned Properties</h4>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    coverageGaps.unassignedProperties.length > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {coverageGaps.unassignedProperties.length}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {coverageGaps.unassignedProperties.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">All properties are assigned to zones.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {coverageGaps.unassignedProperties.map(p => (
                        <div key={p.id} className="px-5 py-2.5">
                          <p className="text-sm font-bold text-gray-900 truncate">{p.address}</p>
                          <p className="text-xs text-gray-500">{p.customer_name} · {p.service_type}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Empty Zones (0 drivers) */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900">Unstaffed Zones</h4>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    coverageGaps.emptyZones.length > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {coverageGaps.emptyZones.length}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {coverageGaps.emptyZones.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">All zones have at least one driver.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {coverageGaps.emptyZones.map(z => (
                        <div key={z.id} className="px-5 py-2.5 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: z.color || '#9CA3AF' }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900">{z.name}</p>
                            <p className="text-xs text-gray-500">{z.property_count} properties, 0 drivers</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Understaffed Zones (1 driver) */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-gray-900">Understaffed Zones</h4>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    coverageGaps.understaffedZones.length > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {coverageGaps.understaffedZones.length}
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {coverageGaps.understaffedZones.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-gray-400">All staffed zones have 2+ drivers.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {coverageGaps.understaffedZones.map(z => (
                        <div key={z.id} className="px-5 py-2.5 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: z.color || '#9CA3AF' }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900">{z.name}</p>
                            <p className="text-xs text-gray-500">{z.property_count} properties, {z.driver_count} driver</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ZonesPanel;
