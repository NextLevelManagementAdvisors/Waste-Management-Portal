import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card.tsx';
import { Button } from '../../components/Button.tsx';
import { MagnifyingGlassIcon } from '../../components/Icons.tsx';
import { LoadingSpinner, Pagination, EmptyState, FilterBar } from './shared.tsx';

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

const truncateJson = (jsonStr: string, maxLength: number = 100) => {
  if (jsonStr.length <= maxLength) return jsonStr;
  return jsonStr.substring(0, maxLength) + '...';
};

const SystemView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('audit');

  // Audit Log Tab State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditEntityTypeFilter, setAuditEntityTypeFilter] = useState('');

  // Global Search Tab State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Settings Tab State
  const [adminInfo, setAdminInfo] = useState<{
    name?: string;
    email?: string;
    role?: string;
  } | null>(null);

  const AUDIT_LIMIT = 50;

  // Fetch audit logs
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

  // Fetch search results
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

  // Fetch admin info when settings tab is opened
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

  // Handle tab change
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'audit') {
      fetchAuditLogs(0, auditActionFilter, auditEntityTypeFilter);
    } else if (tab === 'settings') {
      fetchAdminInfo();
    }
  };

  // Handle audit filter changes
  const handleAuditFilterChange = () => {
    setAuditOffset(0);
    fetchAuditLogs(0, auditActionFilter, auditEntityTypeFilter);
  };

  // Initial load for audit logs
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs(0);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
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

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Filters */}
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

          {/* Audit Logs Table */}
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
                          <td className="px-6 py-3 text-sm text-gray-500 font-mono text-xs">{truncateJson(log.details)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Pagination */}
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

      {/* Global Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          {/* Search Input */}
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

          {/* Search Button */}
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

          {/* Error Message */}
          {searchError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {searchError}
            </div>
          )}

          {/* Loading State */}
          {searchLoading && <LoadingSpinner />}

          {/* Search Results */}
          {searchResults && !searchLoading && (
            <div className="space-y-6">
              {/* Users Section */}
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

              {/* Properties Section */}
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

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Admin Info Card */}
          <Card className="p-6">
            <h3 className="text-lg font-black text-gray-900 mb-4">Your Admin Account</h3>
            {adminInfo ? (
              <div className="space-y-3">
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
                  <p className="text-gray-900">{adminInfo.role || 'N/A'}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Loading admin information...</p>
            )}
          </Card>

          {/* Settings Placeholder */}
          <Card className="p-6 bg-blue-50 border border-blue-200">
            <h3 className="text-lg font-black text-gray-900 mb-2">System Configuration</h3>
            <p className="text-gray-700 mb-4">
              Role-based permissions and system settings coming soon
            </p>
          </Card>

          {/* Admin Roles Reference */}
          <Card className="p-6">
            <h3 className="text-lg font-black text-gray-900 mb-4">Admin Roles</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Full Admin</h4>
                <p className="text-sm text-gray-600">
                  Complete access to all system features, audit logs, customer management, and settings
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Support</h4>
                <p className="text-sm text-gray-600">
                  Access to customer management and support features, read-only access to audit logs
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Viewer</h4>
                <p className="text-sm text-gray-600">
                  Read-only access to analytics, audit logs, and customer information
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SystemView;
