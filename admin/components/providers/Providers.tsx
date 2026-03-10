import React, { useState, useEffect } from 'react';
import { TerritoryManager } from './TerritoryManager';
import { SwapDashboard } from './SwapDashboard';

type ProviderStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended';

interface ProviderSummary {
  id: string;
  name: string;
  slug?: string;
  owner_name: string;
  owner_email: string;
  business_type: string;
  approval_status: ProviderStatus;
  approval_notes?: string;
  suspended_reason?: string;
  insurance_expires_at?: string;
  submitted_at?: string;
  approved_at?: string;
  is_solo_operator: boolean;
}

interface ProviderDetail extends ProviderSummary {
  ein?: string;
  contact_phone?: string;
  contact_email?: string;
  website?: string;
  service_description?: string;
  insurance_cert_url?: string;
  license_number?: string;
  service_zips?: string[];
  stripe_connect_account_id?: string;
}

type AdminTab = 'applications' | 'providers' | 'territories' | 'swaps';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'applications', label: 'Company Applications' },
  { id: 'providers', label: 'All Providers' },
  { id: 'territories', label: 'Territories' },
  { id: 'swaps', label: 'Swaps' },
];

function StatusBadge({ status }: { status: ProviderStatus }) {
  const map: Record<ProviderStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending_review: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    suspended: 'bg-orange-100 text-orange-800',
  };
  const labels: Record<ProviderStatus, string> = {
    draft: 'Draft', pending_review: 'Pending Review', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended',
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status]}`}>{labels[status]}</span>;
}

function CompanyApplications() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/providers/pending', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setProviders(json.providers || json.data || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/providers/${id}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setDetail(json.data || json.provider);
      }
    } catch {}
  };

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  };

  const handleDecision = async (providerId: string, decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !notes.trim()) {
      showMsg('Notes are required when rejecting an application', true);
      return;
    }
    setDeciding(true);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showMsg(`Provider ${decision}`);
      setDetail(null);
      setNotes('');
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setDeciding(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading applications...</div>;

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {providers.length === 0 ? (
        <div className="py-12 text-center text-gray-400 border border-dashed border-gray-200 rounded-xl text-sm">
          No pending applications
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map(p => (
            <div key={p.id} className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{p.name}</p>
                    <StatusBadge status={p.approval_status} />
                    {p.is_solo_operator && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">Solo Operator</span>}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Owner: {p.owner_name} · {p.owner_email}
                    {p.business_type && <span className="ml-2 capitalize">· {p.business_type.replace('_', ' ')}</span>}
                  </p>
                  {p.submitted_at && (
                    <p className="text-xs text-gray-400 mt-0.5">Submitted {new Date(p.submitted_at).toLocaleDateString()}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { detail?.id === p.id ? setDetail(null) : loadDetail(p.id); }}
                  className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  {detail?.id === p.id ? 'Collapse' : 'Review'}
                </button>
              </div>

              {detail?.id === p.id && (
                <div className="border-t border-amber-200 px-5 py-4 bg-white space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {detail.ein && <div><span className="text-gray-500">EIN:</span> <span className="font-medium">{detail.ein}</span></div>}
                    {detail.contact_phone && <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{detail.contact_phone}</span></div>}
                    {detail.contact_email && <div><span className="text-gray-500">Email:</span> <span className="font-medium">{detail.contact_email}</span></div>}
                    {detail.website && <div><span className="text-gray-500">Website:</span> <a href={detail.website} target="_blank" rel="noopener noreferrer" className="text-teal-600 underline">{detail.website}</a></div>}
                    {detail.license_number && <div><span className="text-gray-500">License:</span> <span className="font-medium">{detail.license_number}</span></div>}
                    {detail.insurance_expires_at && <div><span className="text-gray-500">Insurance Expires:</span> <span className="font-medium">{new Date(detail.insurance_expires_at).toLocaleDateString()}</span></div>}
                    {detail.stripe_connect_account_id && <div><span className="text-gray-500">Stripe:</span> <span className="text-green-700 font-medium">Connected</span></div>}
                    {detail.service_zips && detail.service_zips.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Service ZIPs:</span>{' '}
                        <span className="font-medium">{detail.service_zips.join(', ')}</span>
                      </div>
                    )}
                  </div>
                  {detail.service_description && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-1">Service Description</p>
                      <p className="text-sm text-gray-700">{detail.service_description}</p>
                    </div>
                  )}
                  {detail.insurance_cert_url && (
                    <div>
                      <a
                        href={detail.insurance_cert_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:underline font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        View Insurance Certificate
                      </a>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Notes (required for rejection, optional for approval)</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Add notes for the provider..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleDecision(detail.id, 'approved')}
                      disabled={deciding}
                      className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50"
                    >
                      {deciding ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision(detail.id, 'rejected')}
                      disabled={deciding}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {deciding ? 'Processing...' : 'Reject'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDetail(null); setNotes(''); }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AllProviders() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProviderStatus | 'all'>('all');
  const [actioning, setActioning] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Invite hauler modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteNote, setInviteNote] = useState('');
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');
  const [generatingInvite, setGeneratingInvite] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/providers', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setProviders(json.data || json.providers || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showMsg = (msg: string, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    try {
      const res = await fetch('/api/admin/provider-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: inviteNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setGeneratedInviteUrl(json.url);
      navigator.clipboard.writeText(json.url).catch(() => {});
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleSuspend = async (providerId: string) => {
    if (!suspendReason.trim()) { showMsg('A reason is required to suspend a provider', true); return; }
    setActioning(providerId);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/suspend`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: suspendReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showMsg('Provider suspended');
      setSuspendingId(null);
      setSuspendReason('');
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setActioning(null);
    }
  };

  const handleReactivate = async (providerId: string) => {
    if (!confirm('Reactivate this provider?')) return;
    setActioning(providerId);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/reactivate`, {
        method: 'PUT',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showMsg('Provider reactivated');
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setActioning(null);
    }
  };

  const filtered = filter === 'all' ? providers : providers.filter(p => p.approval_status === filter);

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading providers...</div>;

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {/* Filter + Invite Hauler */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['all', 'approved', 'pending_review', 'suspended', 'rejected'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${filter === f ? 'bg-teal-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            {f === 'all' ? `All (${providers.length})` : f.replace('_', ' ')}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setShowInviteModal(true); setGeneratedInviteUrl(''); setInviteNote(''); }}
          className="ml-auto px-3 py-1.5 text-xs font-bold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          Invite Hauler
        </button>
      </div>

      {/* Invite Hauler Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-gray-900">Generate Hauler Invite Link</h3>
            <p className="text-sm text-gray-500">Creates a one-time link that pre-selects provider registration. Valid for 30 days.</p>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Note (optional — for your reference)</label>
              <input
                type="text"
                value={inviteNote}
                onChange={e => setInviteNote(e.target.value)}
                placeholder="e.g. Invited: Acme Hauling, contact: Bob"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {generatedInviteUrl ? (
              <div className="space-y-3">
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
                  <p className="text-xs font-bold text-teal-800 mb-1">Invite link generated and copied!</p>
                  <p className="text-xs text-teal-700 font-mono break-all">{generatedInviteUrl}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(generatedInviteUrl)}
                    className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700"
                  >
                    Copy Again
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowInviteModal(false); setGeneratedInviteUrl(''); setInviteNote(''); }}
                    className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleGenerateInvite}
                  disabled={generatingInvite}
                  className="px-4 py-2 text-sm font-bold bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {generatingInvite ? 'Generating...' : 'Generate Link'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInviteModal(false); setInviteNote(''); }}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-10 text-center text-gray-400 border border-dashed border-gray-200 rounded-xl text-sm">No providers found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <div key={p.id} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{p.name}</p>
                    <StatusBadge status={p.approval_status} />
                    {p.is_solo_operator && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">Solo Op</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {p.owner_name} · {p.owner_email}
                    {p.business_type && <span className="ml-2 capitalize">· {p.business_type.replace('_', ' ')}</span>}
                  </p>
                  {p.insurance_expires_at && (() => {
                    const daysLeft = Math.ceil((new Date(p.insurance_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    if (daysLeft < 0) return <p className="text-xs text-red-600 mt-1 font-medium">Insurance expired {Math.abs(daysLeft)}d ago</p>;
                    if (daysLeft <= 30) return <p className="text-xs text-amber-600 mt-1 font-medium">Insurance expires in {daysLeft}d</p>;
                    return null;
                  })()}
                  {p.suspended_reason && (
                    <p className="text-xs text-orange-700 mt-1">Suspended: {p.suspended_reason}</p>
                  )}
                  {p.approval_status === 'approved' && p.slug && (
                    <p className="text-xs text-teal-600 mt-1">
                      Join page: <a href={`/join/${p.slug}`} target="_blank" rel="noreferrer" className="underline hover:text-teal-800 font-mono">/join/{p.slug}</a>
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {p.approval_status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => setSuspendingId(suspendingId === p.id ? null : p.id)}
                      className="text-xs text-orange-600 hover:underline font-medium"
                    >
                      Suspend
                    </button>
                  )}
                  {p.approval_status === 'suspended' && (
                    <button
                      type="button"
                      onClick={() => handleReactivate(p.id)}
                      disabled={actioning === p.id}
                      className="text-xs text-teal-600 hover:underline font-medium disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>

              {suspendingId === p.id && (
                <div className="mt-3 flex gap-2 items-center">
                  <input
                    type="text"
                    value={suspendReason}
                    onChange={e => setSuspendReason(e.target.value)}
                    placeholder="Reason for suspension (required)"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleSuspend(p.id)}
                    disabled={actioning === p.id}
                    className="px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  >
                    {actioning === p.id ? '...' : 'Confirm'}
                  </button>
                  <button type="button" onClick={() => { setSuspendingId(null); setSuspendReason(''); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const Providers: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('applications');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch('/api/admin/providers/pending', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setPendingCount((d.data || d.providers || []).length))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Provider Management</h2>
        <p className="text-sm text-gray-500 mt-0.5">Review applications, manage active providers, and oversee the contractor network</p>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.id === 'applications' && pendingCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-bold rounded-full bg-amber-500 text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'applications' && <CompanyApplications />}
      {activeTab === 'providers' && <AllProviders />}
      {activeTab === 'territories' && <div className="space-y-4"><TerritoryManager /></div>}
      {activeTab === 'swaps' && <div className="space-y-4"><SwapDashboard /></div>}
    </div>
  );
};

export default Providers;
