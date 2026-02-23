import React, { useState } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { StatusBadge } from '../ui/index.ts';
import CustomerNotes from '../customers/CustomerNotes.tsx';
import CustomerActivityTab from '../customers/CustomerActivityTab.tsx';
import CustomerCommunicationsTab from '../customers/CustomerCommunicationsTab.tsx';

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

type TabKey = 'overview' | 'properties' | 'driver' | 'activity' | 'communications';

const PersonDetail: React.FC<{
  person: any;
  onBack: () => void;
  onPersonUpdated: (updated: any) => void;
}> = ({ person, onBack, onPersonUpdated }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [impersonating, setImpersonating] = useState(false);
  const [editingRoles, setEditingRoles] = useState(false);

  const roles: string[] = person.roles || [];
  const isDriver = roles.includes('driver');
  const isCustomer = roles.includes('customer');
  const isAdmin = roles.includes('admin');

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
        // Reload person detail
        const detailRes = await fetch(`/api/admin/people/${person.id}`, { credentials: 'include' });
        if (detailRes.ok) onPersonUpdated(await detailRes.json());
      }
    } catch (e) {
      console.error('Failed to update role:', e);
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
        ← Back to contacts
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
          <Card className="p-6">
            <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-4">Contact Info</h3>
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
        </div>
      )}

      {activeTab === 'properties' && (
        <div className="space-y-4">
          {(person.properties || []).length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-gray-400">No properties registered</p>
            </Card>
          ) : (
            (person.properties || []).map((p: any) => (
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
              </Card>
            ))
          )}
        </div>
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
