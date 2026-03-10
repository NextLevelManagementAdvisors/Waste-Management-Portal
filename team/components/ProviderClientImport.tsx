import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/Button';

const CAN_SIZES = ['32 gallon', '64 gallon', '96 gallon', '2yd Dumpster', 'Other'];
const FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

interface ClientInvitation {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  can_size: string | null;
  collection_frequency: string | null;
  status: 'pending' | 'sent' | 'registered';
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
  address: string;
  can_size: string | null;
  collection_day: string | null;
  service_status: string;
}

type SubTab = 'import' | 'invitations' | 'clients';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  sent: 'bg-amber-100 text-amber-700',
  registered: 'bg-green-100 text-green-700',
};

const ProviderClientImport: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('import');
  const [importMode, setImportMode] = useState<'single' | 'bulk'>('single');

  // Single form state
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sAddress, setSAddress] = useState('');
  const [sCanSize, setSCanSize] = useState('');
  const [sFrequency, setSFrequency] = useState('');
  const [sNotes, setSNotes] = useState('');
  const [sLoading, setSLoading] = useState(false);
  const [sError, setSError] = useState('');
  const [sSuccess, setSSuccess] = useState('');

  // Bulk form state
  const [bulkText, setBulkText] = useState('');
  const [bulkCanSize, setBulkCanSize] = useState('');
  const [bulkFrequency, setBulkFrequency] = useState('');
  const [bulkParsed, setBulkParsed] = useState<{ name: string; email: string; phone: string; address: string }[]>([]);
  const [bulkPreview, setBulkPreview] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ email: string; success: boolean; error?: string }[] | null>(null);

  // Invitation status tab
  const [invitations, setInvitations] = useState<ClientInvitation[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invFilter, setInvFilter] = useState<'all' | 'pending' | 'sent' | 'registered'>('all');

  // My clients tab
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const fetchInvitations = useCallback(async () => {
    setInvLoading(true);
    try {
      const r = await fetch('/api/team/my-provider/client-invitations', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setInvitations(d.invitations || []); }
    } finally { setInvLoading(false); }
  }, []);

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const r = await fetch('/api/team/my-provider/clients', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); setClients(d.clients || []); }
    } finally { setClientsLoading(false); }
  }, []);

  useEffect(() => {
    if (subTab === 'invitations') fetchInvitations();
    if (subTab === 'clients') fetchClients();
  }, [subTab, fetchInvitations, fetchClients]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSError(''); setSSuccess('');
    if (!sEmail) { setSError('Email is required'); return; }
    setSLoading(true);
    try {
      const r = await fetch('/api/team/my-provider/client-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: sName, email: sEmail, phone: sPhone, address: sAddress, can_size: sCanSize || null, collection_frequency: sFrequency || null, service_notes: sNotes || null }),
      });
      const d = await r.json();
      if (!r.ok) { setSError(d.error || 'Failed to send invitation'); return; }
      setSSuccess(`Invitation sent to ${sEmail}`);
      setSName(''); setSEmail(''); setSPhone(''); setSAddress(''); setSCanSize(''); setSFrequency(''); setSNotes('');
    } catch { setSError('Failed to send invitation'); } finally { setSLoading(false); }
  };

  const parseBulk = () => {
    const lines = bulkText.trim().split('\n').filter(l => l.trim());
    const parsed = lines.map(line => {
      const parts = line.split('\t');
      return {
        name: parts[0]?.trim() || '',
        email: parts[1]?.trim() || '',
        phone: parts[2]?.trim() || '',
        address: parts[3]?.trim() || '',
      };
    }).filter(r => r.email);
    setBulkParsed(parsed);
    setBulkPreview(true);
    setBulkResults(null);
  };

  const handleBulkSubmit = async () => {
    setBulkLoading(true);
    setBulkResults(null);
    try {
      const clients = bulkParsed.map(r => ({
        ...r,
        can_size: bulkCanSize || null,
        collection_frequency: bulkFrequency || null,
      }));
      const r = await fetch('/api/team/my-provider/client-invitations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clients }),
      });
      const d = await r.json();
      if (!r.ok) { alert(d.error || 'Failed to send invitations'); return; }
      setBulkResults(d.results || []);
      setBulkPreview(false);
      setBulkText('');
      setBulkParsed([]);
    } catch { alert('Failed to send invitations'); } finally { setBulkLoading(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this invitation?')) return;
    await fetch(`/api/team/my-provider/client-invitations/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchInvitations();
  };

  const handleResend = async (id: string) => {
    await fetch(`/api/team/my-provider/client-invitations/${id}/resend`, { method: 'POST', credentials: 'include' });
    fetchInvitations();
  };

  const filteredInvitations = invFilter === 'all' ? invitations : invitations.filter(i => i.status === invFilter);

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-2 border-b border-gray-200">
        {([['import', 'Import Clients'], ['invitations', 'Invite Status'], ['clients', 'My Clients']] as [SubTab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subTab === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Import tab */}
      {subTab === 'import' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['single', 'bulk'] as const).map(m => (
              <button key={m} type="button" onClick={() => setImportMode(m)}
                className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  importMode === m ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {m === 'single' ? 'Single' : 'Bulk'}
              </button>
            ))}
          </div>

          {importMode === 'single' && (
            <form onSubmit={handleSingleSubmit} className="space-y-3 max-w-lg">
              {sSuccess && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{sSuccess}</div>}
              {sError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{sError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Name</label>
                  <input type="text" value={sName} onChange={e => setSName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email *</label>
                  <input type="email" value={sEmail} onChange={e => setSEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="john@example.com" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={sPhone} onChange={e => setSPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="(555) 123-4567" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Can Size</label>
                  <select value={sCanSize} onChange={e => setSCanSize(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select size...</option>
                    {CAN_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pickup Frequency</label>
                  <select value={sFrequency} onChange={e => setSFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select...</option>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Service Address</label>
                <textarea value={sAddress} onChange={e => setSAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="123 Main St, Springfield, MO 65801" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Service Notes</label>
                <textarea value={sNotes} onChange={e => setSNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Gate code, access instructions..." />
              </div>
              <Button type="submit" disabled={sLoading} className="w-full">
                {sLoading ? 'Sending...' : 'Send Invitation'}
              </Button>
            </form>
          )}

          {importMode === 'bulk' && (
            <div className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Apply to all — Can Size</label>
                  <select value={bulkCanSize} onChange={e => setBulkCanSize(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select size...</option>
                    {CAN_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Apply to all — Pickup Frequency</label>
                  <select value={bulkFrequency} onChange={e => setBulkFrequency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">Select...</option>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-700">Paste client data (tab-separated: Name | Email | Phone | Address)</label>
                </div>
                <p className="text-xs text-gray-400 mb-2">One client per line. Columns: Name → Email → Phone → Address (tab-separated). Email is required.</p>
                <textarea
                  value={bulkText}
                  onChange={e => { setBulkText(e.target.value); setBulkPreview(false); setBulkResults(null); }}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder={"John Smith\tjohn@example.com\t555-1234\t123 Main St, Springfield MO\nJane Doe\tjane@example.com\t555-5678\t456 Oak Ave, Nixa MO"}
                />
                <button type="button" onClick={parseBulk} disabled={!bulkText.trim()} className="mt-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium disabled:opacity-50">
                  Preview Import
                </button>
              </div>

              {bulkPreview && bulkParsed.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">{bulkParsed.length} client{bulkParsed.length !== 1 ? 's' : ''} ready to import:</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Name', 'Email', 'Phone', 'Address'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-bold text-gray-600">{h}</th>
                          ))}
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {bulkParsed.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2">{row.name}</td>
                            <td className="px-3 py-2">{row.email}</td>
                            <td className="px-3 py-2">{row.phone}</td>
                            <td className="px-3 py-2">{row.address}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => setBulkParsed(prev => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button onClick={handleBulkSubmit} disabled={bulkLoading}>
                    {bulkLoading ? 'Sending...' : `Send ${bulkParsed.length} Invitation${bulkParsed.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              )}

              {bulkResults && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Results:</p>
                  {bulkResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded-lg ${r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <span>{r.success ? '✓' : '✗'}</span>
                      <span>{r.email}</span>
                      {r.error && <span className="ml-auto">{r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Invite Status tab */}
      {subTab === 'invitations' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'pending', 'sent', 'registered'] as const).map(f => (
              <button key={f} type="button" onClick={() => setInvFilter(f)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  invFilter === f ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <button type="button" onClick={fetchInvitations} className="ml-auto px-3 py-1 text-xs text-gray-500 hover:text-gray-700">Refresh</button>
          </div>

          {invLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-teal-600" /></div>
          ) : filteredInvitations.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No invitations found.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Email', 'Can Size', 'Frequency', 'Status', 'Sent', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInvitations.map(inv => (
                    <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">{inv.name || '—'}</td>
                      <td className="px-3 py-2">{inv.email}</td>
                      <td className="px-3 py-2">{inv.can_size || '—'}</td>
                      <td className="px-3 py-2">{inv.collection_frequency || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[inv.status] || ''}`}>{inv.status}</span>
                      </td>
                      <td className="px-3 py-2">{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2 flex gap-2">
                        {inv.status !== 'registered' && (
                          <>
                            {inv.status === 'sent' && (
                              <button type="button" onClick={() => handleResend(inv.id)} className="text-blue-600 hover:text-blue-800">Resend</button>
                            )}
                            <button type="button" onClick={() => handleRevoke(inv.id)} className="text-red-500 hover:text-red-700">Revoke</button>
                          </>
                        )}
                        {inv.status === 'registered' && <span className="text-green-600">Registered</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* My Clients tab */}
      {subTab === 'clients' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" onClick={fetchClients} className="text-xs text-gray-500 hover:text-gray-700">Refresh</button>
          </div>
          {clientsLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-teal-600" /></div>
          ) : clients.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No registered clients yet. Import clients from the Import tab to get started.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Email', 'Address', 'Can Size', 'Pickup Day', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-bold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map(client => (
                    <tr key={client.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{client.name}</td>
                      <td className="px-3 py-2">{client.email}</td>
                      <td className="px-3 py-2">{client.address}</td>
                      <td className="px-3 py-2">{client.can_size || '—'}</td>
                      <td className="px-3 py-2">{client.collection_day || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${
                          client.service_status === 'approved' ? 'bg-green-100 text-green-700' :
                          client.service_status === 'pending_review' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{client.service_status?.replace('_', ' ') || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProviderClientImport;
