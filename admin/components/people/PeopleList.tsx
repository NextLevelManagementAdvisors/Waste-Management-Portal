import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { MagnifyingGlassIcon, ArrowRightIcon } from '../../../components/Icons.tsx';
import { LoadingSpinner, Pagination, EmptyState, StatusBadge } from '../ui/index.ts';
import type { NavFilter } from '../../../shared/types/index.ts';
import InviteDialog from './InviteDialog.tsx';
import CreateDriverDialog from './CreateDriverDialog.tsx';
import BulkComposeModal from './BulkComposeModal.tsx';
import DriverSyncPanel from '../operations/DriverSyncPanel.tsx';

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
    <span key={role} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${colors[role] || 'bg-gray-100 text-gray-700'}`}>
      {role}
    </span>
  );
};

interface PeopleListProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  onSelectPerson: (id: string) => void;
}

const PeopleList: React.FC<PeopleListProps> = ({ navFilter, onFilterConsumed, onSelectPerson }) => {
  const [people, setPeople] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showCreateDriver, setShowCreateDriver] = useState(false);
  const [showDriverSync, setShowDriverSync] = useState(false);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Map<string, any>>(new Map());
  const [showComposeModal, setShowComposeModal] = useState(false);

  const isSelected = (id: string) => selectedPeople.has(id);

  const toggleSelection = (person: any) => {
    setSelectedPeople(prev => {
      const next = new Map(prev);
      if (next.has(person.id)) next.delete(person.id);
      else next.set(person.id, person);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    const allOnPageSelected = people.length > 0 && people.every(p => selectedPeople.has(p.id));
    setSelectedPeople(prev => {
      const next = new Map(prev);
      if (allOnPageSelected) {
        people.forEach(p => next.delete(p.id));
      } else {
        people.forEach(p => next.set(p.id, p));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedPeople(new Map());

  useEffect(() => {
    if (navFilter) {
      if (navFilter.search) setSearchQuery(navFilter.search);
      if (navFilter.tab) setRoleFilter(navFilter.tab);
      if (navFilter.sort) setSortBy(navFilter.sort);
      setPage(1);
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const loadPeople = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const sortMap: Record<string, { sortBy: string; sortDir: string }> = {
        newest:    { sortBy: 'created_at', sortDir: 'desc' },
        oldest:    { sortBy: 'created_at', sortDir: 'asc' },
        name_asc:  { sortBy: 'name',       sortDir: 'asc' },
        name_desc: { sortBy: 'name',       sortDir: 'desc' },
      };
      const s = sortMap[sortBy];
      if (s) { params.set('sortBy', s.sortBy); params.set('sortDir', s.sortDir); }
      params.set('limit', String(limit));
      params.set('page', String(page));

      const res = await fetch(`/api/admin/people?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPeople(data.users || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load people:', e);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, roleFilter, sortBy, limit, page]);

  useEffect(() => { loadPeople(); }, [loadPeople]);

  const loadInvitations = useCallback(async () => {
    setInvitationsLoading(true);
    try {
      const res = await fetch('/api/admin/invitations', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setInvitations(data);
      }
    } catch (e) {
      console.error('Failed to load invitations:', e);
    } finally {
      setInvitationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roleFilter === 'invited') loadInvitations();
  }, [roleFilter, loadInvitations]);

  const revokeInvitation = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/invitations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) loadInvitations();
    } catch (e) {
      console.error('Failed to revoke invitation:', e);
    }
  };

  const [resendingId, setResendingId] = useState<string | null>(null);

  const resendInvitation = async (id: string) => {
    setResendingId(id);
    try {
      const res = await fetch(`/api/admin/invitations/${id}/resend`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) loadInvitations();
    } catch (e) {
      console.error('Failed to resend invitation:', e);
    } finally {
      setResendingId(null);
    }
  };

  const getInvitationStatus = (inv: any) => {
    if (inv.status === 'accepted') return 'accepted';
    if (inv.status === 'revoked') return 'revoked';
    if (new Date(inv.expires_at) < new Date()) return 'expired';
    return 'pending';
  };

  const handleImpersonate = async (person: any, portal: 'customer' | 'driver') => {
    try {
      if (portal === 'driver') {
        // Need the driver profile ID for impersonation
        const detailRes = await fetch(`/api/admin/people/${person.id}`, { credentials: 'include' });
        if (!detailRes.ok) return;
        const detail = await detailRes.json();
        if (!detail.driverProfile?.id) return;
        const res = await fetch(`/api/admin/impersonate-driver/${detail.driverProfile.id}`, {
          method: 'POST', credentials: 'include',
        });
        if (res.ok) window.location.href = '/team/';
      } else {
        const res = await fetch(`/api/admin/impersonate/${person.id}`, {
          method: 'POST', credentials: 'include',
        });
        if (res.ok) window.location.href = '/';
      }
    } catch {
      // Silently fail
    }
  };

  const totalPages = Math.ceil(total / limit);

  const roleTabs = [
    { key: 'all', label: 'All' },
    { key: 'customer', label: 'Customers' },
    { key: 'driver', label: 'Drivers' },
    { key: 'admin', label: 'Admins' },
    { key: 'invited', label: 'Invited' },
  ];

  return (
    <div className={`space-y-6 ${selectedPeople.size > 0 ? 'pb-20' : ''}`}>
      {/* Header with tabs and actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {roleTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setRoleFilter(tab.key); setPage(1); clearSelection(); }}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap flex-shrink-0 ${
                roleFilter === tab.key
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{total} contact{total !== 1 ? 's' : ''}</p>
          {roleFilter === 'driver' && (
            <>
              <Button size="sm" onClick={() => setShowCreateDriver(true)}>+ Create Driver</Button>
              <Button
                variant={showDriverSync ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowDriverSync(!showDriverSync)}
              >
                OptimoRoute Sync
              </Button>
            </>
          )}
          <Button onClick={() => setShowInvite(true)}>+ Invite</Button>
        </div>
      </div>

      {/* Search and sort */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); clearSelection(); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setPage(1); clearSelection(); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
        </select>
      </div>

      {/* Select all bar */}
      {roleFilter !== 'invited' && !loading && people.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <button type="button" onClick={toggleSelectAllOnPage} className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              people.every(p => selectedPeople.has(p.id))
                ? 'bg-teal-600 border-teal-600 text-white'
                : people.some(p => selectedPeople.has(p.id))
                  ? 'bg-teal-200 border-teal-400'
                  : 'border-gray-300 hover:border-teal-400'
            }`}>
              {people.every(p => selectedPeople.has(p.id)) && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              )}
              {!people.every(p => selectedPeople.has(p.id)) && people.some(p => selectedPeople.has(p.id)) && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" /></svg>
              )}
            </span>
            <span className="text-sm text-gray-500 font-medium">Select all on page</span>
          </button>
          {selectedPeople.size > 0 && (
            <span className="text-sm text-teal-600 font-bold">{selectedPeople.size} selected</span>
          )}
        </div>
      )}

      {/* People / Invitations list */}
      {roleFilter === 'invited' ? (
        invitationsLoading ? (
          <LoadingSpinner />
        ) : invitations.length === 0 ? (
          <EmptyState icon="users" message="No invitations found" />
        ) : (
          <div className="grid gap-3">
            {invitations.map((inv: any) => {
              const status = getInvitationStatus(inv);
              const statusColors: Record<string, string> = {
                pending: 'bg-yellow-100 text-yellow-700',
                accepted: 'bg-green-100 text-green-700',
                expired: 'bg-gray-100 text-gray-500',
                revoked: 'bg-red-100 text-red-700',
              };
              return (
                <Card key={inv.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0 flex-wrap">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-500 font-bold text-sm">
                          {(inv.name || inv.email || inv.phone || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{inv.name || 'No name'}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {inv.email && <span className="truncate">{inv.email}</span>}
                          {inv.email && inv.phone && <span>·</span>}
                          {inv.phone && <span>{inv.phone}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {(inv.roles || []).map((r: string) => roleBadge(r))}
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
                        {status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {inv.inviter_first_name} {inv.inviter_last_name}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(inv.created_at)}</span>
                      {(status === 'pending' || status === 'expired') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={resendingId === inv.id}
                          onClick={() => resendInvitation(inv.id)}
                        >
                          {resendingId === inv.id ? 'Sending...' : 'Resend'}
                        </Button>
                      )}
                      {status === 'pending' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => revokeInvitation(inv.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <>
          {loading ? (
            <LoadingSpinner />
          ) : people.length === 0 ? (
            <EmptyState icon="users" message={searchQuery ? 'No contacts match your search' : 'No contacts found'} />
          ) : (
            <div className="grid gap-3">
              {people.map((person: any) => (
                <Card key={person.id} className={`p-4 hover:border-teal-200 transition-colors cursor-pointer ${isSelected(person.id) ? 'border-teal-300 bg-teal-50/50' : ''}`} onClick={() => onSelectPerson(person.id)}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0 flex-wrap">
                      <button
                        type="button"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleSelection(person); }}
                        className="flex-shrink-0"
                      >
                        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected(person.id)
                            ? 'bg-teal-600 border-teal-600 text-white'
                            : 'border-gray-300 hover:border-teal-400'
                        }`}>
                          {isSelected(person.id) && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      </button>
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-teal-700 font-bold text-sm">
                          {(person.firstName || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{person.firstName} {person.lastName}</p>
                        <p className="text-sm text-gray-500 truncate">{person.email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {(person.roles || []).map((r: string) => roleBadge(r))}
                      </div>
                      {person.driverOnboardingStatus && person.driverOnboardingStatus !== 'completed' && (
                        <StatusBadge status={person.driverOnboardingStatus} />
                      )}
                      {person.driverRating && (
                        <span className="text-xs text-yellow-600 font-medium flex-shrink-0">{Number(person.driverRating).toFixed(1)} rating</span>
                      )}
                      {person.propertyCount > 0 && (
                        <span className="text-xs text-gray-400 flex-shrink-0">{person.propertyCount} properties</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">{formatDate(person.createdAt)}</span>
                      {(person.roles || []).includes('driver') && (
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleImpersonate(person, 'driver'); }}
                        >
                          Sign In as Driver
                        </Button>
                      )}
                      {(person.roles || []).includes('customer') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleImpersonate(person, 'customer'); }}
                        >
                          Sign In as Customer
                        </Button>
                      )}
                      <ArrowRightIcon className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {roleFilter === 'driver' && showDriverSync && (
        <DriverSyncPanel />
      )}

      {showInvite && (
        <InviteDialog
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); roleFilter === 'invited' ? loadInvitations() : loadPeople(); }}
        />
      )}

      {showCreateDriver && (
        <CreateDriverDialog
          onClose={() => setShowCreateDriver(false)}
          onCreated={() => { setShowCreateDriver(false); loadPeople(); }}
        />
      )}

      {/* Floating bulk action bar */}
      {selectedPeople.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-black text-sm">
                {selectedPeople.size}
              </span>
              <span className="text-sm font-bold text-gray-700">
                {selectedPeople.size === 1 ? 'person' : 'people'} selected
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-gray-400 hover:text-gray-600 font-bold ml-2"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowComposeModal(true)}>
                Send Message
              </Button>
            </div>
          </div>
        </div>
      )}

      {showComposeModal && (
        <BulkComposeModal
          recipients={Array.from(selectedPeople.values())}
          onClose={() => setShowComposeModal(false)}
          onSent={() => { setShowComposeModal(false); clearSelection(); }}
        />
      )}
    </div>
  );
};

export default PeopleList;
