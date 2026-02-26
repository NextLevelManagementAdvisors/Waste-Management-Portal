import React, { useState } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { StatusBadge } from '../ui/index.ts';
import CustomerNotes from './CustomerNotes.tsx';
import CustomerActivityTab from './CustomerActivityTab.tsx';
import CustomerCommunicationsTab from './CustomerCommunicationsTab.tsx';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const roleBadge = (role: string) => {
  const colors: Record<string, string> = {
    customer: 'bg-blue-100 text-blue-700',
    driver: 'bg-orange-100 text-orange-700',
    admin: 'bg-purple-100 text-purple-700',
  };
  return (
    <span key={role} className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${colors[role] || 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  );
};

// ── Pickup Schedule Editor (per-property) ──

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const FREQUENCIES = ['weekly', 'bi-weekly', 'monthly'];

const PropertyPickupEditor: React.FC<{
  property: any;
  onSaved: (updated: any) => void;
}> = ({ property, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(property.pickup_day || '');
  const [freq, setFreq] = useState(property.pickup_frequency || 'weekly');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/properties/${property.id}/pickup-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pickup_day: day || null, pickup_frequency: freq }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save');
        return;
      }
      const data = await res.json();
      onSaved(data.property);
      setEditing(false);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Pickup:</span>
          {property.pickup_day ? (
            <>
              <span className="text-xs font-bold text-gray-700 capitalize">{property.pickup_day}</span>
              <span className="text-xs text-gray-400">({property.pickup_frequency || 'weekly'})</span>
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                property.pickup_day_source === 'manual' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
              }`}>
                {property.pickup_day_source === 'manual' ? 'Manual' : 'Auto-detected'}
              </span>
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">Not set</span>
          )}
        </div>
        <button onClick={() => setEditing(true)} className="text-xs text-teal-600 hover:text-teal-700 font-bold">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-2">
      <div className="flex items-center gap-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Pickup Day</label>
          <select
            value={day}
            onChange={e => setDay(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Not set</option>
            {DAYS.map(d => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Frequency</label>
          <select
            value={freq}
            onChange={e => setFreq(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {FREQUENCIES.map(f => (
              <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 pb-0.5">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(''); }} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};

const PropertyTabContent: React.FC<{
  properties: any[];
  personId: string;
  onPersonUpdated: (updated: any) => void;
}> = ({ properties, personId, onPersonUpdated }) => {
  const [localProps, setLocalProps] = useState(properties);

  const handlePickupSaved = (propId: string, updated: any) => {
    setLocalProps(prev => prev.map(p =>
      p.id === propId ? { ...p, ...updated } : p
    ));
  };

  if (localProps.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-400">No properties registered</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {localProps.map((p: any) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">{p.address}</p>
              <p className="text-sm text-gray-500">
                {p.service_type}
                {p.in_hoa && ' | HOA'}
                {p.community_name && ` | ${p.community_name}`}
              </p>
            </div>
            <StatusBadge status={p.transfer_status || 'active'} />
          </div>
          <PropertyPickupEditor
            property={p}
            onSaved={(updated) => handlePickupSaved(p.id, updated)}
          />
        </Card>
      ))}
    </div>
  );
};

type TabKey = 'overview' | 'properties' | 'driver' | 'activity' | 'communications';

const PersonDetail: React.FC<{
  person: any;
  onBack: () => void;
  onPersonUpdated: (updated: any) => void;
  onPersonDeleted?: () => void;
}> = ({ person, onBack, onPersonUpdated, onPersonDeleted }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [impersonating, setImpersonating] = useState(false);
  const [editingRoles, setEditingRoles] = useState(false);

  // Inline edit state
  const [editingContact, setEditingContact] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: person.firstName || '',
    lastName: person.lastName || '',
    email: person.email || '',
    phone: person.phone || '',
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const roles: string[] = person.roles || [];
  const isDriver = roles.includes('driver');
  const isCustomer = roles.includes('customer');
  const isAdmin = roles.includes('admin');
  const fullName = `${person.firstName || ''} ${person.lastName || ''}`.trim();

  const handleImpersonateCustomer = async () => {
    setImpersonating(true);
    try {
      const res = await fetch(`/api/admin/impersonate/${person.id}`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) window.location.href = '/';
    } catch {} finally {
      setImpersonating(false);
    }
  };

  const handleImpersonateDriver = async () => {
    if (!person.driverProfile?.id) return;
    setImpersonating(true);
    try {
      const res = await fetch(`/api/admin/impersonate-driver/${person.driverProfile.id}`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) window.location.href = '/team/';
    } catch {} finally {
      setImpersonating(false);
    }
  };

  const handleRoleToggle = async (role: string, action: 'add' | 'remove') => {
    try {
      const res = await fetch(`/api/admin/people/${person.id}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, action }),
      });
      if (res.ok) {
        const detailRes = await fetch(`/api/admin/people/${person.id}`, { credentials: 'include' });
        if (detailRes.ok) onPersonUpdated(await detailRes.json());
      }
    } catch (e) {
      console.error('Failed to update role:', e);
    }
  };

  const handleEditSave = async () => {
    setSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/admin/customers/${person.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error || 'Failed to save');
        return;
      }
      setEditingContact(false);
      // Reload person detail
      const detailRes = await fetch(`/api/admin/people/${person.id}`, { credentials: 'include' });
      if (detailRes.ok) {
        const updated = await detailRes.json();
        onPersonUpdated(updated);
        setEditForm({
          firstName: updated.firstName || '',
          lastName: updated.lastName || '',
          email: updated.email || '',
          phone: updated.phone || '',
        });
      }
    } catch {
      setEditError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditingContact(false);
    setEditError('');
    setEditForm({
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      email: person.email || '',
      phone: person.phone || '',
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/people/${person.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || 'Failed to delete');
        return;
      }
      onPersonDeleted?.();
    } catch {
      setDeleteError('Network error');
    } finally {
      setDeleting(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    ...(isCustomer ? [{ key: 'properties' as TabKey, label: `Properties (${(person.properties || []).length})` }] : []),
    ...(isDriver ? [{ key: 'driver' as TabKey, label: 'Driver Profile' }] : []),
    { key: 'activity', label: 'Activity' },
    { key: 'communications', label: 'Messages' },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-sm">
        &larr; Back to contacts
      </Button>

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center">
              <span className="text-teal-700 font-black text-xl">
                {(person.firstName || '?').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900">{person.firstName} {person.lastName}</h2>
              <p className="text-sm text-gray-500">{person.email}</p>
              {person.phone && <p className="text-sm text-gray-400">{person.phone}</p>}
              <div className="flex items-center gap-1.5 mt-2">
                {roles.map(r => roleBadge(r))}
                {isAdmin && person.adminRole && (
                  <span className="text-xs text-gray-400 ml-1">({person.adminRole})</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isCustomer && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleImpersonateCustomer}
                disabled={impersonating}
              >
                Sign In as Customer
              </Button>
            )}
            {isDriver && (
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={handleImpersonateDriver}
                disabled={impersonating}
              >
                Sign In as Driver
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact Info — editable */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider">Contact Info</h3>
              {!editingContact ? (
                <Button size="sm" variant="ghost" onClick={() => setEditingContact(true)}>Edit</Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={handleEditCancel} disabled={saving}>Cancel</Button>
                  <Button size="sm" onClick={handleEditSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}
            </div>
            {editError && <p className="text-xs text-red-600 mb-3">{editError}</p>}
            {editingContact ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            ) : (
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd className="text-sm font-medium text-gray-900">{person.email}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Phone</dt>
                  <dd className="text-sm font-medium text-gray-900">{person.phone || 'Not set'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Joined</dt>
                  <dd className="text-sm font-medium text-gray-900">{formatDate(person.createdAt)}</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider">Roles</h3>
              <Button size="sm" variant="ghost" onClick={() => setEditingRoles(!editingRoles)}>
                {editingRoles ? 'Done' : 'Edit'}
              </Button>
            </div>
            {editingRoles ? (
              <div className="space-y-3">
                {(['customer', 'driver', 'admin'] as const).map(role => (
                  <div key={role} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 capitalize">{role}</span>
                    {roles.includes(role) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => handleRoleToggle(role, 'remove')}
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleRoleToggle(role, 'add')}
                      >
                        Add
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roles.length === 0 ? (
                  <p className="text-sm text-gray-400">No roles assigned</p>
                ) : (
                  roles.map(r => roleBadge(r))
                )}
              </div>
            )}
          </Card>

          <div className="lg:col-span-2">
            <CustomerNotes customerId={person.id} />
          </div>

          {/* Delete User */}
          <div className="lg:col-span-2">
            <Card className="p-6 border-red-200">
              <h3 className="text-sm font-black text-red-600 uppercase tracking-wider mb-2">Danger Zone</h3>
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">Permanently delete this user and all their data.</p>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete User
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">
                    This will permanently delete <strong>{fullName}</strong> and all associated data (properties, roles, driver profile, notes, etc.). This action cannot be undone.
                  </p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Type <strong>{fullName}</strong> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmName}
                      onChange={e => setDeleteConfirmName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder={fullName}
                    />
                  </div>
                  {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName(''); setDeleteError(''); }}
                      disabled={deleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleDelete}
                      disabled={deleting || deleteConfirmName !== fullName}
                    >
                      {deleting ? 'Deleting...' : 'Permanently Delete'}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'properties' && (
        <PropertyTabContent properties={person.properties || []} personId={person.id} onPersonUpdated={onPersonUpdated} />
      )}

      {activeTab === 'driver' && person.driverProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-4">Driver Info</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Status</dt>
                <dd><StatusBadge status={person.driverProfile.status || 'active'} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Onboarding</dt>
                <dd><StatusBadge status={person.driverProfile.onboarding_status || 'pending'} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Rating</dt>
                <dd className="text-sm font-medium text-gray-900">{Number(person.driverProfile.rating || 5).toFixed(1)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Jobs Completed</dt>
                <dd className="text-sm font-medium text-gray-900">{person.driverProfile.total_jobs_completed || 0}</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-4">Onboarding Checklist</h3>
            <div className="space-y-3">
              {[
                { label: 'W-9 Completed', done: person.driverProfile.w9_completed },
                { label: 'Direct Deposit', done: person.driverProfile.direct_deposit_completed },
                { label: 'Stripe Connect', done: person.driverProfile.stripe_connect_onboarded },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${item.done ? 'bg-green-100' : 'bg-gray-100'}`}>
                    {item.done ? (
                      <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-300" />
                    )}
                  </div>
                  <span className={`text-sm ${item.done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'activity' && (
        <CustomerActivityTab customerId={person.id} />
      )}

      {activeTab === 'communications' && (
        <CustomerCommunicationsTab customerId={person.id} />
      )}
    </div>
  );
};

export default PersonDetail;
