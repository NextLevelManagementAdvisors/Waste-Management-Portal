import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.tsx';
import { Button } from '../../components/Button.tsx';
import { MagnifyingGlassIcon } from '../../components/Icons.tsx';
import { LoadingSpinner, Pagination, EmptyState, FilterBar, ConfirmDialog } from './shared.tsx';

type TabType = 'audit' | 'search' | 'settings';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  adminName: string;
  adminEmail: string;
  createdAt: string;
}

interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  type: string;
}

interface Property {
  id: string;
  address: string;
  service_type: string;
  owner_name: string;
  type: string;
}

interface SearchResponse {
  users: User[];
  properties: Property[];
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface RoleDefinition {
  id: string;
  label: string;
  permissions: string[];
}

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const parseDetails = (details: any): Record<string, any> | null => {
  if (!details) return null;
  if (typeof details === 'object') return details;
  try { return JSON.parse(details); } catch { return null; }
};

const DetailsPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-md px-2 py-0.5 text-xs mr-1 mb-1">
    <span className="text-gray-400 font-medium">{label}:</span>
    <span className="font-semibold truncate max-w-[140px]" title={value}>{value}</span>
  </span>
);

const DetailsCell: React.FC<{ details: any }> = ({ details }) => {
  const parsed = parseDetails(details);
  if (!parsed || Object.keys(parsed).length === 0) return <span className="text-gray-300">&mdash;</span>;

  const formatKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
  const formatValue = (v: any): string => {
    if (v === null || v === undefined) return '\u2014';
    if (typeof v === 'number') return v.toLocaleString();
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="flex flex-wrap max-w-xs">
      {Object.entries(parsed).map(([key, val]) => (
        <DetailsPill key={key} label={formatKey(key)} value={formatValue(val)} />
      ))}
    </div>
  );
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

const SystemView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('audit');

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [adminInfo, setAdminInfo] = useState<{
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    permissions?: string[];
  } | null>(null);

  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [editingRoleUserId, setEditingRoleUserId] = useState<string | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null);

  const AUDIT_LIMIT = 50;

  const fetchAuditLogs = async (offset: number, action?: string, entityType?: string) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const params = new URLSearchParams({
        limit: AUDIT_LIMIT.toString(),
        offset: offset.toString(),
      });
      if (action) params.append('action', action);
      if (entityType) params.append('entityType', entityType);

      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      const data: AuditLogResponse = await res.json();
      setAuditLogs(data.logs);
      setAuditTotal(data.total);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Error fetching audit logs');
      setAuditLogs([]);
      setAuditTotal(0);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchSearchResults = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Failed to search');
      const data: SearchResponse = await res.json();
      setSearchResults(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Error performing search');
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchAdminInfo = async () => {
    try {
      const res = await fetch('/api/admin/current');
      if (res.ok) {
        const data = await res.json();
        setAdminInfo(data);
      }
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
        setRoleDefinitions(data.roles || []);
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
        setRoleSuccess(`Role updated successfully`);
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

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'audit') {
      fetchAuditLogs(0, auditActionFilter, auditEntityTypeFilter);
    } else if (tab === 'settings') {
      fetchAdminInfo();
      fetchRoles();
    }
  };

  const handleAuditFilterChange = () => {
    setAuditOffset(0);
    fetchAuditLogs(0, auditActionFilter, auditEntityTypeFilter);
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs(0);
    }
  }, []);

  const isFullAdmin = adminInfo?.role === 'full_admin';

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-gray-200 sticky top-0 bg-white z-10 pb-0">
        <button
          onClick={() => handleTabChange('audit')}
          className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Audit Log
        </button>
        <button
          onClick={() => handleTabChange('search')}
          className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'search'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Global Search
        </button>
        <button
          onClick={() => handleTabChange('settings')}
          className={`px-4 py-3 font-semibold border-b-2 transition-colors ${
            activeTab === 'settings'
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Settings
        </button>
      </div>

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <FilterBar className="bg-white">
            <input
              type="text"
              placeholder="Filter by action..."
              value={auditActionFilter}
              onChange={(e) => {
                setAuditActionFilter(e.target.value);
                setAuditOffset(0);
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAuditFilterChange();
                }
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <select
              value={auditEntityTypeFilter}
              onChange={(e) => {
                setAuditEntityTypeFilter(e.target.value);
                setAuditOffset(0);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            >
              <option value="">All Entity Types</option>
              <option value="user">User</option>
              <option value="system">System</option>
              <option value="missed_pickup">Missed Pickup</option>
            </select>
            <Button
              size="sm"
              onClick={handleAuditFilterChange}
            >
              Apply Filters
            </Button>
          </FilterBar>

          {auditError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {auditError}
            </div>
          )}

          {auditLoading ? (
            <LoadingSpinner />
          ) : auditLogs.length === 0 ? (
            <EmptyState message="No audit logs found" />
          ) : (
            <div className="space-y-4">
              <Card className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Admin</th>
                        <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Action</th>
                        <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Entity Type</th>
                        <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Entity ID</th>
                        <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest text-gray-600">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 text-sm text-gray-900">{formatDate(log.createdAt)}</td>
                          <td className="px-6 py-3 text-sm">
                            <div className="text-gray-900 font-medium">{log.adminName}</div>
                            <div className="text-xs text-gray-500">{log.adminEmail}</div>
                          </td>
                          <td className="px-6 py-3 text-sm text-gray-900 font-medium">{log.action}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">{log.entityType}</td>
                          <td className="px-6 py-3 text-sm text-gray-700">{log.entityId}</td>
                          <td className="px-6 py-3"><DetailsCell details={log.details} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Pagination
                total={auditTotal}
                limit={AUDIT_LIMIT}
                offset={auditOffset}
                onChange={(newOffset) => {
                  setAuditOffset(newOffset);
                  fetchAuditLogs(newOffset, auditActionFilter, auditEntityTypeFilter);
                }}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users or properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  fetchSearchResults(searchQuery);
                }
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => fetchSearchResults(searchQuery)}>
              Search
            </Button>
            {searchQuery && (
              <Button variant="secondary" onClick={() => {
                setSearchQuery('');
                setSearchResults(null);
                setSearchError(null);
              }}>
                Clear
              </Button>
            )}
          </div>

          {searchError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {searchError}
            </div>
          )}

          {searchLoading && <LoadingSpinner />}

          {searchResults && !searchLoading && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-3">
                  Users ({searchResults.users.length})
                </h3>
                {searchResults.users.length === 0 ? (
                  <p className="text-gray-500">No users found</p>
                ) : (
                  <div className="grid gap-3">
                    {searchResults.users.map((user) => (
                      <Card
                        key={user.id}
                        className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">
                              {user.first_name} {user.last_name}
                            </p>
                            <p className="text-sm text-gray-600">{user.email}</p>
                            <p className="text-xs text-gray-500 mt-1">ID: {user.id}</p>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {user.type}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-black text-gray-900 mb-3">
                  Properties ({searchResults.properties.length})
                </h3>
                {searchResults.properties.length === 0 ? (
                  <p className="text-gray-500">No properties found</p>
                ) : (
                  <div className="grid gap-3">
                    {searchResults.properties.map((property) => (
                      <Card
                        key={property.id}
                        className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{property.address}</p>
                            <p className="text-sm text-gray-600">Owner: {property.owner_name}</p>
                            <p className="text-xs text-gray-500 mt-1">ID: {property.id}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {property.service_type}
                            </span>
                            <span className="text-xs text-gray-500">{property.type}</span>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!searchResults && !searchLoading && !searchError && !searchQuery && (
            <EmptyState message="Enter a search query to find users or properties" />
          )}
        </div>
      )}

      {activeTab === 'settings' && (
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-gray-900">Role Definitions</h3>
            </div>
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
      )}
    </div>
  );
};

export default SystemView;
