import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import type { AdminUser, RoleDefinition, CurrentAdminUser } from '../../../shared/types/index.ts';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const ROLE_DESCRIPTIONS: Record<string, { label: string; description: string; color: string }> = {
  full_admin: {
    label: 'Full Admin',
    description: 'Complete access to all system features, customer management, billing, settings, and role management',
    color: 'bg-red-100 text-red-800',
  },
  support: {
    label: 'Support',
    description: 'Access to customer management, communications, operations, and read-only billing and audit logs',
    color: 'bg-blue-100 text-blue-800',
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to dashboard analytics, customer information, and audit logs',
    color: 'bg-gray-100 text-gray-700',
  },
};

const AdminRoles: React.FC = () => {
  const [adminInfo, setAdminInfo] = useState<CurrentAdminUser | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [editingRoleUserId, setEditingRoleUserId] = useState<string | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null);

  const fetchAdminInfo = async () => {
    try {
      const res = await fetch('/api/admin/current');
      if (res.ok) setAdminInfo(await res.json());
    } catch (err) {
      console.error('Failed to fetch admin info', err);
    }
  };

  const fetchRoles = async () => {
    setRolesLoading(true);
    setRolesError(null);
    try {
      const res = await fetch('/api/admin/roles', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data.admins || []);
      } else if (res.status === 403) {
        setRolesError('You do not have permission to manage roles');
      } else {
        setRolesError('Failed to fetch role data');
      }
    } catch {
      setRolesError('Failed to fetch role data');
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminInfo();
    fetchRoles();
  }, []);

  const handleSaveRole = async (userId: string) => {
    setSavingRole(true);
    setRoleSuccess(null);
    try {
      const res = await fetch(`/api/admin/roles/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: editingRoleValue }),
      });
      if (res.ok) {
        setAdminUsers(prev => prev.map(a => a.id === userId ? { ...a, role: editingRoleValue } : a));
        setEditingRoleUserId(null);
        setRoleSuccess('Role updated successfully');
        setTimeout(() => setRoleSuccess(null), 3000);
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to update role');
      }
    } catch {
      alert('Failed to update role');
    } finally {
      setSavingRole(false);
    }
  };

  const isFullAdmin = adminInfo?.role === 'full_admin';

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-black text-gray-900 mb-4">Your Admin Account</h3>
        {adminInfo ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Name</p>
              <p className="text-gray-900">{adminInfo.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Email</p>
              <p className="text-gray-900">{adminInfo.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Role</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_DESCRIPTIONS[adminInfo.role || '']?.color || 'bg-gray-100 text-gray-700'}`}>
                {ROLE_DESCRIPTIONS[adminInfo.role || '']?.label || adminInfo.role || 'N/A'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Loading admin information...</p>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-black text-gray-900 mb-4">Role Definitions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(ROLE_DESCRIPTIONS).map(([roleId, info]) => (
            <div key={roleId} className="border border-gray-200 rounded-xl p-4 hover:border-teal-200 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${info.color}`}>
                  {info.label}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{info.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {isFullAdmin && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-gray-900">Admin Users & Roles</h3>
            <Button variant="secondary" size="sm" onClick={fetchRoles} disabled={rolesLoading}>
              {rolesLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {roleSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm mb-4">
              {roleSuccess}
            </div>
          )}

          {rolesError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm mb-4">
              {rolesError}
            </div>
          )}

          {rolesLoading ? (
            <LoadingSpinner />
          ) : adminUsers.length === 0 ? (
            <EmptyState message="No admin users found" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-500">Admin</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-500">Since</th>
                    <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminUsers.map(admin => (
                    <tr key={admin.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-black text-white">
                              {admin.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-gray-900">{admin.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{admin.email}</td>
                      <td className="px-4 py-3">
                        {editingRoleUserId === admin.id ? (
                          <select
                            value={editingRoleValue}
                            onChange={e => setEditingRoleValue(e.target.value)}
                            className="px-2 py-1.5 border border-teal-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          >
                            <option value="full_admin">Full Admin</option>
                            <option value="support">Support</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_DESCRIPTIONS[admin.role]?.color || 'bg-gray-100 text-gray-700'}`}>
                            {ROLE_DESCRIPTIONS[admin.role]?.label || admin.role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(admin.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        {editingRoleUserId === admin.id ? (
                          <div className="flex items-center gap-2 justify-center">
                            <Button size="sm" onClick={() => handleSaveRole(admin.id)} disabled={savingRole}>
                              {savingRole ? 'Saving...' : 'Save'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingRoleUserId(null)} disabled={savingRole}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingRoleUserId(admin.id);
                              setEditingRoleValue(admin.role);
                            }}
                            disabled={admin.id === adminInfo?.id}
                          >
                            {admin.id === adminInfo?.id ? 'You' : 'Edit Role'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {!isFullAdmin && adminInfo && (
        <Card className="p-6 bg-amber-50 border border-amber-200">
          <h3 className="text-lg font-black text-gray-900 mb-2">Role Management</h3>
          <p className="text-gray-700 text-sm">
            Only Full Admin users can manage roles and permissions. Contact a Full Admin to request changes.
          </p>
        </Card>
      )}
    </div>
  );
};

export default AdminRoles;
