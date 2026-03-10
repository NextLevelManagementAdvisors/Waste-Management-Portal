import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

const PERMISSION_KEYS = [
  { key: 'execute_routes', label: 'Execute Routes', desc: 'Can be dispatched to routes' },
  { key: 'dispatch_routes', label: 'Dispatch Routes', desc: 'Can assign drivers to routes' },
  { key: 'manage_members', label: 'Manage Members', desc: 'Invite, remove, change roles' },
  { key: 'manage_fleet', label: 'Manage Fleet', desc: 'Add/edit/remove vehicles' },
  { key: 'manage_billing', label: 'Manage Billing', desc: 'Update company profile and banking' },
  { key: 'view_team_schedule', label: 'View Team Schedule', desc: "See teammates' schedules" },
  { key: 'view_team_routes', label: 'View Team Routes', desc: 'See routes assigned to teammates' },
  { key: 'view_earnings_report', label: 'View Earnings', desc: 'See accounting and financial view' },
];

interface ProviderRole {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
  is_owner_role: boolean;
  is_default_role: boolean;
}

const ProviderRolesManager: React.FC = () => {
  const [roles, setRoles] = useState<ProviderRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New role form
  const [showAdd, setShowAdd] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newPerms, setNewPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team/my-provider/roles', { credentials: 'include' });
      if (res.ok) setRoles((await res.json()).roles || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const handleTogglePermission = async (role: ProviderRole, key: string) => {
    if (role.is_owner_role) return;
    const updated = { ...role.permissions, [key]: !role.permissions[key] };
    try {
      const res = await fetch(`/api/team/my-provider/roles/${role.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ permissions: updated }),
      });
      if (!res.ok) throw new Error();
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: updated } : r));
    } catch {
      showMsg('Failed to update permission', true);
    }
  };

  const handleDeleteRole = async (role: ProviderRole) => {
    if (role.is_owner_role || role.is_default_role) {
      showMsg('Cannot delete the Owner or default Driver role', true);
      return;
    }
    if (!confirm(`Delete role "${role.name}"? Members with this role will lose it.`)) return;
    try {
      const res = await fetch(`/api/team/my-provider/roles/${role.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete');
      showMsg('Role deleted');
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    }
  };

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/team/my-provider/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newRoleName, permissions: newPerms }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create');
      showMsg('Role created');
      setShowAdd(false);
      setNewRoleName('');
      setNewPerms({});
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading roles...</div>;

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-gray-900">Roles & Permissions</h3>
            <p className="text-xs text-gray-500 mt-0.5">Control what each role can do within your company</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>+ Add Role</Button>
        </div>

        <div className="space-y-6">
          {roles.map(role => (
            <div key={role.id} className={`border rounded-xl p-4 ${role.is_owner_role ? 'border-teal-200 bg-teal-50' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900">{role.name}</h4>
                  {role.is_owner_role && <span className="text-xs px-2 py-0.5 bg-teal-200 text-teal-800 rounded-full font-medium">Owner</span>}
                  {role.is_default_role && !role.is_owner_role && <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full font-medium">Default</span>}
                </div>
                {!role.is_owner_role && !role.is_default_role && (
                  <button
                    type="button"
                    onClick={() => handleDeleteRole(role)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PERMISSION_KEYS.map(({ key, label, desc }) => (
                  <label
                    key={key}
                    className={`flex items-start gap-3 p-2 rounded-lg ${role.is_owner_role ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={role.is_owner_role ? true : (role.permissions[key] || false)}
                      onChange={() => handleTogglePermission(role, key)}
                      disabled={role.is_owner_role}
                      className="mt-0.5 h-4 w-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add Role Form */}
        {showAdd && (
          <form onSubmit={handleAddRole} className="border-2 border-dashed border-teal-300 rounded-xl p-4 mt-5 space-y-3">
            <h4 className="font-bold text-sm text-gray-900">New Custom Role</h4>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Role Name *</label>
              <input
                type="text"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                required
                placeholder="e.g. Dispatcher"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Permissions</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PERMISSION_KEYS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPerms[key] || false}
                      onChange={() => setNewPerms(p => ({ ...p, [key]: !p[key] }))}
                      className="h-4 w-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving || !newRoleName}>{saving ? 'Creating...' : 'Create Role'}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setShowAdd(false); setNewRoleName(''); setNewPerms({}); }}>Cancel</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};

export default ProviderRolesManager;
