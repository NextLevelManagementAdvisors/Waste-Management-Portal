import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, EmptyState } from '../ui/index.ts';
import type { CompensationRule, CompensationRuleType } from '../../../shared/types/operations.ts';

const RULE_TYPE_LABELS: Record<CompensationRuleType, string> = {
  base_rate: 'Base Rate',
  service_type_modifier: 'Service Type Modifier',
  difficulty_modifier: 'Difficulty Modifier',
  zone_modifier: 'Zone Modifier',
};

const RULE_TYPE_DESCRIPTIONS: Record<CompensationRuleType, string> = {
  base_rate: 'The flat dollar amount per stop before modifiers are applied',
  service_type_modifier: 'Multiplier applied when the location matches a specific service type',
  difficulty_modifier: 'Multiplier applied based on the location difficulty score',
  zone_modifier: 'Multiplier applied to locations within a specific service zone',
};

interface FormState {
  name: string;
  ruleType: CompensationRuleType;
  rateAmount: string;
  rateMultiplier: string;
  priority: string;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  conditionServiceType: string;
  conditionDifficultyMin: string;
  conditionDifficultyMax: string;
  conditionZoneId: string;
}

const emptyForm: FormState = {
  name: '',
  ruleType: 'base_rate',
  rateAmount: '',
  rateMultiplier: '1.0',
  priority: '0',
  active: true,
  effectiveFrom: '',
  effectiveTo: '',
  conditionServiceType: '',
  conditionDifficultyMin: '',
  conditionDifficultyMax: '',
  conditionZoneId: '',
};

const CompensationRulesPanel: React.FC = () => {
  const [rules, setRules] = useState<CompensationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<Array<{ id: string; name: string }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewZone, setPreviewZone] = useState('');
  const [previewData, setPreviewData] = useState<{ locations: any[]; summary: { avgRate: number; minRate: number; maxRate: number; sampledCount: number; totalLocations: number } } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/compensation-rules', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch rules');
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading rules');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/service-zones', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setZones((data.zones || []).map((z: any) => ({ id: z.id, name: z.name })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchRules(); fetchZones(); }, [fetchRules, fetchZones]);

  const fetchPreview = async (zoneId?: string) => {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (zoneId) params.set('zoneId', zoneId);
      const res = await fetch(`/api/admin/compensation-rules/preview?${params}`, { credentials: 'include' });
      if (res.ok) setPreviewData(await res.json());
    } catch { /* ignore */ }
    finally { setPreviewLoading(false); }
  };

  const buildConditions = (f: FormState): Record<string, any> => {
    const conditions: Record<string, any> = {};
    if (f.ruleType === 'service_type_modifier' && f.conditionServiceType) {
      conditions.service_type = f.conditionServiceType;
    }
    if (f.ruleType === 'difficulty_modifier') {
      if (f.conditionDifficultyMin) conditions.difficulty_min = parseFloat(f.conditionDifficultyMin);
      if (f.conditionDifficultyMax) conditions.difficulty_max = parseFloat(f.conditionDifficultyMax);
    }
    if (f.ruleType === 'zone_modifier' && f.conditionZoneId) {
      conditions.zone_id = f.conditionZoneId;
    }
    return conditions;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        ruleType: form.ruleType,
        conditions: buildConditions(form),
        rateAmount: form.rateAmount ? parseFloat(form.rateAmount) : null,
        rateMultiplier: parseFloat(form.rateMultiplier) || 1.0,
        priority: parseInt(form.priority) || 0,
        active: form.active,
        effectiveFrom: form.effectiveFrom || null,
        effectiveTo: form.effectiveTo || null,
      };

      const url = editingId
        ? `/api/admin/compensation-rules/${editingId}`
        : '/api/admin/compensation-rules';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save rule');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving rule');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (rule: CompensationRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      ruleType: rule.ruleType,
      rateAmount: rule.rateAmount != null ? rule.rateAmount.toString() : '',
      rateMultiplier: rule.rateMultiplier.toString(),
      priority: rule.priority.toString(),
      active: rule.active,
      effectiveFrom: rule.effectiveFrom ? rule.effectiveFrom.split('T')[0] : '',
      effectiveTo: rule.effectiveTo ? rule.effectiveTo.split('T')[0] : '',
      conditionServiceType: rule.conditions?.service_type || '',
      conditionDifficultyMin: rule.conditions?.difficulty_min?.toString() || '',
      conditionDifficultyMax: rule.conditions?.difficulty_max?.toString() || '',
      conditionZoneId: rule.conditions?.zone_id || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this compensation rule?')) return;
    try {
      const res = await fetch(`/api/admin/compensation-rules/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete');
      fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting rule');
    }
  };

  const handleToggleActive = async (rule: CompensationRule) => {
    try {
      const res = await fetch(`/api/admin/compensation-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: !rule.active }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error toggling rule');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Compensation Rules</h3>
          <p className="text-sm text-gray-500">Configure how driver compensation is calculated per stop. Rules are evaluated in order: base rate, then all matching modifiers are multiplied together.</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
          className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
        >
          Add Rule
        </button>
      </div>

      {/* Preview Impact section */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setShowPreview(!showPreview); if (!showPreview && !previewData) fetchPreview(previewZone || undefined); }}
          className={`px-3 py-1.5 text-xs font-medium rounded-full ${showPreview ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          Preview Impact
        </button>
        {showPreview && (
          <select value={previewZone} onChange={e => { setPreviewZone(e.target.value); fetchPreview(e.target.value || undefined); }}
            className="border border-gray-300 rounded-lg px-2 py-1 text-xs">
            <option value="">All Zones</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        )}
      </div>

      {showPreview && (
        <Card>
          <div className="p-4 space-y-3">
            {previewLoading ? (
              <p className="text-sm text-gray-500 text-center py-4">Loading preview...</p>
            ) : previewData ? (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-sm">Rule Impact Preview</h4>
                  <span className="text-xs text-gray-500">{previewData.summary.sampledCount} of {previewData.summary.totalLocations} locations sampled</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Avg Rate</p>
                    <p className="text-lg font-bold text-gray-900">${previewData.summary.avgRate.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Min</p>
                    <p className="text-lg font-bold text-gray-900">${previewData.summary.minRate.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase">Max</p>
                    <p className="text-lg font-bold text-gray-900">${previewData.summary.maxRate.toFixed(2)}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {previewData.locations.map((loc: any) => (
                    <div key={loc.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-1.5">
                      <span className="text-gray-700 truncate flex-1" title={loc.address}>{loc.address}</span>
                      <span className="text-gray-400 mx-2">{loc.serviceType}</span>
                      {loc.zoneName && <span className="text-gray-400 mx-2">{loc.zoneName}</span>}
                      <span className={`font-medium ml-2 ${
                        loc.breakdown?.source === 'custom_rate' ? 'text-purple-600' :
                        loc.breakdown?.source === 'contract_rate' ? 'text-blue-600' : 'text-teal-600'
                      }`}>
                        ${loc.breakdown?.finalRate?.toFixed(2) ?? '0.00'}
                      </span>
                      <span className={`text-[10px] ml-1.5 px-1.5 py-0.5 rounded ${
                        loc.breakdown?.source === 'custom_rate' ? 'bg-purple-50 text-purple-600' :
                        loc.breakdown?.source === 'contract_rate' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600'
                      }`}>
                        {loc.breakdown?.source === 'custom_rate' ? 'Custom' : loc.breakdown?.source === 'contract_rate' ? 'Contract' : 'Rules'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No preview data available.</p>
            )}
          </div>
        </Card>
      )}

      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {showForm && (
        <Card>
          <div className="p-4 space-y-4">
            <h4 className="font-bold text-gray-900">{editingId ? 'Edit Rule' : 'New Compensation Rule'}</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                <input
                  type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Default Base Rate"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type</label>
                <select
                  value={form.ruleType} onChange={e => setForm({ ...form, ruleType: e.target.value as CompensationRuleType })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">{RULE_TYPE_DESCRIPTIONS[form.ruleType]}</p>
              </div>

              {form.ruleType === 'base_rate' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate Amount ($)</label>
                  <input
                    type="number" step="0.01" min="0" value={form.rateAmount}
                    onChange={e => setForm({ ...form, rateAmount: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. 3.00"
                  />
                </div>
              )}

              {form.ruleType !== 'base_rate' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate Multiplier</label>
                  <input
                    type="number" step="0.01" min="0" value={form.rateMultiplier}
                    onChange={e => setForm({ ...form, rateMultiplier: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. 1.5"
                  />
                  <p className="text-xs text-gray-400 mt-1">1.0 = no change, 1.5 = 50% more, 0.8 = 20% less</p>
                </div>
              )}

              {form.ruleType === 'service_type_modifier' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                  <input
                    type="text" value={form.conditionServiceType}
                    onChange={e => setForm({ ...form, conditionServiceType: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. commercial"
                  />
                </div>
              )}

              {form.ruleType === 'difficulty_modifier' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Min Difficulty Score</label>
                    <input
                      type="number" step="0.1" min="0" max="5" value={form.conditionDifficultyMin}
                      onChange={e => setForm({ ...form, conditionDifficultyMin: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. 1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Difficulty Score</label>
                    <input
                      type="number" step="0.1" min="0" max="5" value={form.conditionDifficultyMax}
                      onChange={e => setForm({ ...form, conditionDifficultyMax: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="(optional)"
                    />
                  </div>
                </>
              )}

              {form.ruleType === 'zone_modifier' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Zone</label>
                  <select
                    value={form.conditionZoneId} onChange={e => setForm({ ...form, conditionZoneId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select a zone...</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number" min="0" value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-1">Higher priority rules evaluated first within same type</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective From</label>
                <input
                  type="date" value={form.effectiveFrom}
                  onChange={e => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective To</label>
                <input
                  type="date" value={form.effectiveTo}
                  onChange={e => setForm({ ...form, effectiveTo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for no end date</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox" checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 text-teal-600 rounded"
                />
                <label className="text-sm text-gray-700">Active</label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave} disabled={saving || !form.name}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {rules.length === 0 ? (
        <EmptyState message="No compensation rules configured yet. Add a base rate rule to get started." />
      ) : (
        <div className="space-y-2">
          {(['base_rate', 'service_type_modifier', 'difficulty_modifier', 'zone_modifier'] as CompensationRuleType[]).map(type => {
            const typeRules = rules.filter(r => r.ruleType === type);
            if (typeRules.length === 0) return null;
            return (
              <Card key={type}>
                <div className="p-4">
                  <h4 className="font-bold text-gray-800 text-sm mb-3">{RULE_TYPE_LABELS[type]}</h4>
                  <div className="space-y-2">
                    {typeRules.map(rule => (
                      <div key={rule.id} className={`flex items-center justify-between p-3 rounded-lg border ${rule.active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{rule.name}</span>
                            {!rule.active && <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Inactive</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {type === 'base_rate' && rule.rateAmount != null && <span>${rule.rateAmount.toFixed(2)} per stop</span>}
                            {type !== 'base_rate' && <span>{rule.rateMultiplier}x multiplier</span>}
                            {rule.conditions?.service_type && <span> | Service: {rule.conditions.service_type}</span>}
                            {rule.conditions?.difficulty_min != null && <span> | Difficulty &ge; {rule.conditions.difficulty_min}</span>}
                            {rule.conditions?.zone_id && <span> | Zone: {zones.find(z => z.id === rule.conditions.zone_id)?.name || 'Unknown'}</span>}
                            {rule.effectiveFrom && <span> | From: {rule.effectiveFrom.split('T')[0]}</span>}
                            {rule.effectiveTo && <span> | To: {rule.effectiveTo.split('T')[0]}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          <button onClick={() => handleToggleActive(rule)} className="p-1.5 text-gray-400 hover:text-gray-600" title={rule.active ? 'Deactivate' : 'Activate'}>
                            {rule.active ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                            )}
                          </button>
                          <button onClick={() => handleEdit(rule)} className="p-1.5 text-gray-400 hover:text-teal-600" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => handleDelete(rule.id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CompensationRulesPanel;
