import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, StatusBadge, EmptyState } from '../ui/index.ts';

const TeamView: React.FC = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverEmail, setNewDriverEmail] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const loadDrivers = () => {
    setLoading(true);
    fetch('/api/admin/drivers', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  const handleImpersonate = async (driver: any) => {
    setImpersonatingId(driver.id);
    try {
      const res = await fetch(`/api/admin/impersonate-driver/${driver.id}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        window.location.href = '/team/';
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to sign in as driver');
      }
    } catch {
      alert('Failed to sign in as driver');
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newDriverName.trim(),
          email: newDriverEmail.trim() || undefined,
          phone: newDriverPhone.trim() || undefined,
        }),
      });
      if (res.ok) {
        const driver = await res.json();
        setDrivers(prev => [...prev, driver]);
        setNewDriverName('');
        setNewDriverEmail('');
        setNewDriverPhone('');
        setShowAddForm(false);
      } else {
        const json = await res.json();
        setAddError(json.error || 'Failed to add driver');
      }
    } catch {
      setAddError('Failed to add driver');
    } finally {
      setAdding(false);
    }
  };

  const filtered = drivers.filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (d.name || '').toLowerCase().includes(q) || (d.email || '').toLowerCase().includes(q);
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-500">{drivers.length} team member{drivers.length !== 1 ? 's' : ''} registered</p>
          {drivers.length > 5 && (
            <input
              type="text"
              placeholder="Search team members..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 w-64"
            />
          )}
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : '+ Add Driver'}
        </Button>
      </div>

      {showAddForm && (
        <Card className="p-6">
          <h3 className="text-base font-black text-gray-900 mb-4">Add New Driver</h3>
          {addError && <p className="text-sm text-red-600 mb-3">{addError}</p>}
          <form onSubmit={handleAddDriver} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Name *</label>
              <input
                type="text"
                value={newDriverName}
                onChange={e => setNewDriverName(e.target.value)}
                placeholder="Driver name"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={newDriverEmail}
                  onChange={e => setNewDriverEmail(e.target.value)}
                  placeholder="driver@example.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Phone (optional)</label>
                <input
                  type="tel"
                  value={newDriverPhone}
                  onChange={e => setNewDriverPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)} disabled={adding}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding || !newDriverName.trim()}>
                {adding ? 'Adding...' : 'Add Driver'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="users" message={searchQuery ? 'No team members match your search' : 'No team members registered yet'} />
      ) : (
        <div className="grid gap-3">
          {filtered.map((driver: any) => (
            <Card key={driver.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <span className="text-orange-700 font-bold text-sm">
                      {(driver.name || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{driver.name}</p>
                    <p className="text-sm text-gray-500">{driver.email || 'No email'}</p>
                  </div>
                  {driver.phone && (
                    <span className="text-xs text-gray-400">{driver.phone}</span>
                  )}
                  <StatusBadge status={driver.onboarding_status === 'completed' ? 'active' : driver.onboarding_status || 'pending'} />
                  {driver.rating && (
                    <span className="text-xs text-yellow-600 font-medium">{Number(driver.rating).toFixed(1)} rating</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleImpersonate(driver)}
                    disabled={impersonatingId === driver.id}
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {impersonatingId === driver.id ? 'Switching...' : 'Sign In as Driver'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamView;
