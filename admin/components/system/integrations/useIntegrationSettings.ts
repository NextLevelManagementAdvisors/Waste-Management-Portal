import { useState, useEffect, useCallback } from 'react';
import type { SettingItem, IntegrationTestResult } from './types';

export function useIntegrationSettings() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, IntegrationTestResult>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [testingOne, setTestingOne] = useState<string | null>(null);

  const fetchSettings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', { credentials: 'include' });
      if (!res.ok) {
        setError(res.status === 403 ? 'You do not have permission to view settings' : 'Failed to load settings');
        return;
      }
      setSettings(await res.json());
    } catch {
      setError('Failed to load settings');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const flashSuccess = (msg: string, ms = 3000) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), ms);
  };

  const flashError = (msg: string, ms = 5000) => {
    setError(msg);
    setTimeout(() => setError(null), ms);
  };

  const handleSave = async (key: string) => {
    setSaving(true);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value: editValue }),
      });
      if (res.ok) {
        setEditingKey(null);
        setEditValue('');
        flashSuccess(`${key} updated successfully`);
        await fetchSettings(true);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save setting');
      }
    } catch {
      alert('Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  const saveSetting = async (key: string, value: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        flashError(`Failed to save ${key}: ${data.error || res.statusText}`);
        return false;
      }
      await fetchSettings(true);
      return true;
    } catch {
      flashError(`Failed to save ${key} — network error`);
      return false;
    }
  };

  const startEditing = (setting: SettingItem) => {
    setEditingKey(setting.key);
    const stripMask = (val: string) => val.startsWith('••') ? '' : val;
    setEditValue(setting.is_secret ? '' : (setting.source === 'db' || !setting.is_secret ? stripMask(setting.value) : ''));
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        JSON.parse(text);
        setEditValue(text);
      } catch {
        alert('Invalid JSON file. Please upload a valid service account JSON key file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const testAllConnections = async () => {
    setTestingAll(true);
    try {
      const res = await fetch('/api/admin/integrations/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setIntegrationStatus(data.results);
      }
    } catch { /* ignore */ }
    finally { setTestingAll(false); }
  };

  const testSingleConnection = async (category: string, mode?: string) => {
    setTestingOne(category);
    try {
      let url = `/api/admin/integrations/status?integration=${category}`;
      if (mode) url += `&mode=${mode}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setIntegrationStatus(prev => ({ ...prev, ...data.results }));
      }
    } catch { /* ignore */ }
    finally { setTestingOne(null); }
  };

  const getSettingsForCategory = (category: string): SettingItem[] => {
    return settings.filter(s => s.category === category && s.display_type !== 'hidden' && s.display_type !== 'toggle');
  };

  const hasCredentials = (category: string): boolean => {
    return settings
      .filter(s => s.category === category)
      .some(s => s.value && s.value !== '' && s.value !== '••••');
  };

  const getSettingValue = (key: string): string | undefined => {
    return settings.find(s => s.key === key)?.value;
  };

  return {
    settings,
    loading,
    error,
    successMsg,
    editingKey,
    editValue,
    saving,
    integrationStatus,
    testingAll,
    testingOne,
    fetchSettings,
    handleSave,
    saveSetting,
    startEditing,
    cancelEditing,
    setEditValue,
    handleFileUpload,
    testAllConnections,
    testSingleConnection,
    getSettingsForCategory,
    hasCredentials,
    getSettingValue,
    flashSuccess,
    flashError,
  };
}
