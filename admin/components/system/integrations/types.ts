export interface SettingItem {
  key: string;
  value: string;
  category: string;
  is_secret: boolean;
  label: string;
  display_type?: 'text' | 'secret' | 'toggle' | 'file_json' | 'hidden';
  source: 'db' | 'env';
  updated_at: string | null;
}

export interface IntegrationTestResult {
  status: 'connected' | 'not_configured' | 'error';
  message: string;
  latencyMs?: number;
}

export interface SectionConfig {
  category: string;
  title: string;
  description: string;
  group?: string;
  renderMode: 'standard' | 'custom';
}
