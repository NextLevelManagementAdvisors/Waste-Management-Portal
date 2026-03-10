import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

interface Member {
  id: string;
  user_id: string;
  name: string;
  email: string;
  employment_type: string;
  status: string;
  role_id: string;
  role_name: string;
  optimoroute_driver_id?: string;
}

interface ProviderRole {
  id: string;
  name: string;
  is_owner_role: boolean;
  is_default_role: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role_name?: string;
  employment_type?: string;
  created_at: string;
  expires_at: string;
}

const ProviderTeamPanel: React.FC = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<ProviderRole[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteMode, setInviteMode] = useState<'single' | 'bulk'>('single');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteEmploymentType, setInviteEmploymentType] = useState('contractor');
  const [inviting, setInviting] = useState(false);
  // Bulk invite state
  const [bulkEmailsText, setBulkEmailsText] = useState('');
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [bulkDone, setBulkDone] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [membersRes, invitationsRes, rolesRes] = await Promise.all([
        fetch('/api/team/my-provider/members', { credentials: 'include' }),
        fetch('/api/team/my-provider/invitations', { credentials: 'include' }),
        fetch('/api/team/my-provider/roles', { credentials: 'include' }),
      ]);
      if (membersRes.ok) setMembers((await membersRes.json()).members || []);
      if (invitationsRes.ok) setInvitations((await invitationsRes.json()).invitations || []);
      if (rolesRes.ok) {
        const data = (await rolesRes.json()).roles || [];
        setRoles(data);
        if (!inviteRoleId && data.length) {
          const def = data.find((r: ProviderRole) => r.is_default_role) || data[0];
          setInviteRoleId(def.id);
        }
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch('/api/team/my-provider/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail, name: inviteName, phone: invitePhone, role_id: inviteRoleId, employment_type: inviteEmploymentType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to invite');
      showMsg('Invitation sent!');
      setShowInvite(false);
      setInviteEmail(''); setInviteName(''); setInvitePhone('');
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    } finally {
      setInviting(false);
    }
  };

  const handleBulkInvite = async () => {
    const emails = bulkEmailsText.split('\n').map(e => e.trim()).filter(e => e && e.includes('@'));
    const unique = [...new Set(emails)];
    if (unique.length === 0) { showMsg('No valid emails found', true); return; }
    setInviting(true);
    setBulkDone(false);
    let sent = 0;
    for (const email of unique) {
      setBulkProgress(`Sending ${sent + 1}/${unique.length}...`);
      try {
        await fetch('/api/team/my-provider/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, role_id: inviteRoleId, employment_type: inviteEmploymentType }),
        });
        sent++;
      } catch {}
    }
    setBulkProgress(null);
    setBulkDone(true);
    setInviting(false);
    showMsg(`${sent} invitation${sent !== 1 ? 's' : ''} sent`);
    setBulkEmailsText('');
    load();
  };

  const handleRoleChange = async (memberId: string, roleId: string) => {
    try {
      const res = await fetch(`/api/team/my-provider/members/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role_id: roleId }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      showMsg('Failed to change role', true);
    }
  };

  const handleSetOptimoId = async (memberId: string, currentId: string) => {
    const newId = prompt('Enter OptimoRoute Driver ID:', currentId || '');
    if (newId === null) return;
    try {
      const res = await fetch(`/api/team/my-provider/members/${memberId}/optimo-id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ optimoroute_driver_id: newId }),
      });
      if (!res.ok) throw new Error();
      showMsg('OptimoRoute ID updated');
      load();
    } catch {
      showMsg('Failed to update OptimoRoute ID', true);
    }
  };

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from your team?`)) return;
    try {
      const res = await fetch(`/api/team/my-provider/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to remove');
      showMsg(`${name} removed from team`);
      load();
    } catch (err: any) {
      showMsg(err.message, true);
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    try {
      await fetch(`/api/team/my-provider/invitations/${id}`, { method: 'DELETE', credentials: 'include' });
      load();
    } catch {}
  };

  const statusBadge = (status: string) => {
    const cls = status === 'active' ? 'bg-green-100 text-green-800' : status === 'suspended' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600';
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
  };

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm">Loading team...</div>;

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      {/* Members */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Team Members ({members.length})</h3>
          <Button size="sm" onClick={() => setShowInvite(true)}>Invite Member</Button>
        </div>

        {/* Invite Form */}
        {showInvite && (
          <div className="border border-gray-200 rounded-xl p-4 mb-5 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm text-gray-900">Invite Team Members</h4>
              <div className="flex gap-1">
                {(['single', 'bulk'] as const).map(m => (
                  <button key={m} type="button" onClick={() => { setInviteMode(m); setBulkDone(false); }}
                    className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                      inviteMode === m ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}>
                    {m === 'single' ? 'Single' : 'Bulk'}
                  </button>
                ))}
              </div>
            </div>

            {inviteMode === 'single' && (
              <form onSubmit={handleInvite} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Name</label>
                    <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Email *</label>
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required placeholder="jane@example.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Phone</label>
                    <input type="tel" value={invitePhone} onChange={e => setInvitePhone(e.target.value)} placeholder="(555) 123-4567" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Role</label>
                    <select value={inviteRoleId} onChange={e => setInviteRoleId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      {roles.filter(r => !r.is_owner_role).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Employment Type</label>
                    <div className="flex gap-4">
                      {['contractor', 'employee'].map(t => (
                        <label key={t} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" value={t} checked={inviteEmploymentType === t} onChange={() => setInviteEmploymentType(t)} className="text-teal-600" />
                          <span className="text-sm capitalize">{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={inviting}>{inviting ? 'Sending...' : 'Send Invitation'}</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowInvite(false)}>Cancel</Button>
                </div>
                <p className="text-xs text-gray-400">Invitation link expires in 7 days.</p>
              </form>
            )}

            {inviteMode === 'bulk' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Role (applies to all)</label>
                    <select value={inviteRoleId} onChange={e => setInviteRoleId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      {roles.filter(r => !r.is_owner_role).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Employment Type (applies to all)</label>
                    <div className="flex gap-4 mt-2">
                      {['contractor', 'employee'].map(t => (
                        <label key={t} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" value={t} checked={inviteEmploymentType === t} onChange={() => setInviteEmploymentType(t)} className="text-teal-600" />
                          <span className="text-sm capitalize">{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email addresses (one per line)</label>
                  <textarea
                    value={bulkEmailsText}
                    onChange={e => { setBulkEmailsText(e.target.value); setBulkDone(false); }}
                    rows={5}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder={"jane@example.com\nmike@example.com\nsarah@example.com"}
                  />
                  {bulkEmailsText.trim() && (
                    <p className="text-xs text-gray-500 mt-1">
                      {bulkEmailsText.split('\n').map(e => e.trim()).filter(e => e && e.includes('@')).length} valid email{bulkEmailsText.split('\n').filter(e => e.trim() && e.includes('@')).length !== 1 ? 's' : ''} detected
                    </p>
                  )}
                </div>
                {bulkProgress && <p className="text-xs text-gray-500">{bulkProgress}</p>}
                {bulkDone && <p className="text-xs text-green-600">All invitations sent!</p>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleBulkInvite} disabled={inviting || !bulkEmailsText.trim()}>
                    {inviting ? bulkProgress || 'Sending...' : `Send ${bulkEmailsText.split('\n').map(e => e.trim()).filter(e => e && e.includes('@')).length || ''} Invitations`}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowInvite(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {members.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            No team members yet. Invite your first driver above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">Member</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">Role</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">Type</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">Status</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">OptimoRoute ID</th>
                  <th className="text-right py-2 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map(m => (
                  <tr key={m.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        value={m.role_id}
                        onChange={e => handleRoleChange(m.id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                      >
                        {roles.filter(r => !r.is_owner_role).map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs capitalize text-gray-600">{m.employment_type || '—'}</span>
                    </td>
                    <td className="py-3 pr-4">{statusBadge(m.status)}</td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => handleSetOptimoId(m.id, m.optimoroute_driver_id || '')}
                        className={`text-xs underline ${m.optimoroute_driver_id ? 'text-gray-700' : 'text-orange-600'}`}
                        title="Set OptimoRoute driver ID for dispatch"
                      >
                        {m.optimoroute_driver_id || 'Not set'}
                      </button>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.id, m.name)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Pending Invitations ({invitations.length})</h3>
          <div className="space-y-2">
            {invitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="font-medium text-sm text-gray-900">{inv.email}</p>
                  <p className="text-xs text-gray-500">
                    {inv.role_name && <span className="mr-2">{inv.role_name}</span>}
                    {inv.employment_type && <span className="capitalize mr-2">{inv.employment_type}</span>}
                    · Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeInvitation(inv.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default ProviderTeamPanel;
