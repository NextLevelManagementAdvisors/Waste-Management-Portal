import React, { useState } from 'react';
import { TerritoryStep } from './TerritoryStep';

type OnboardingStep = 'welcome' | 'territory' | 'payouts' | 'done';

interface OnboardingWizardProps {
  providerId: string;
  providerName: string;
  initialStatus?: string;
  onStatusChanged?: () => void;
}

async function updateProvider(providerId: string, body: Record<string, any>): Promise<void> {
  const res = await fetch(`/api/admin/providers/${providerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to update provider (${res.status})`);
  }
}

function mapStatusToStep(status?: string): OnboardingStep {
  if (status === 'pending_payouts') return 'payouts';
  if (status === 'active') return 'done';
  if (status === 'pending_territory') return 'territory';
  return 'welcome';
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  providerId,
  providerName,
  initialStatus,
  onStatusChanged,
}) => {
  const [step, setStep] = useState<OnboardingStep>(mapStatusToStep(initialStatus));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onTerritoryDefined = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProvider(providerId, { onboarding_status: 'pending_payouts' });
      onStatusChanged?.();
      setStep('payouts');
    } catch (err: any) {
      setError(err?.message || 'Failed to advance onboarding.');
    } finally {
      setSaving(false);
    }
  };

  const completePayoutSetup = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProvider(providerId, { onboarding_status: 'active' });
      onStatusChanged?.();
      setStep('done');
    } catch (err: any) {
      setError(err?.message || 'Failed to complete onboarding.');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <div>
            <h1 className="text-2xl font-bold mb-4">Welcome, {providerName}!</h1>
            <p className="mb-6">Complete onboarding to activate this provider for assignments and swaps.</p>
            <button
              type="button"
              onClick={() => setStep('territory')}
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-semibold"
            >
              Get Started
            </button>
          </div>
        );
      case 'territory':
        return (
          <TerritoryStep
            providerId={providerId}
            onComplete={onTerritoryDefined}
            onTerritoryCreated={onStatusChanged}
          />
        );
      case 'payouts':
        return (
            <div>
                <h1 className="text-2xl font-bold mb-4">Set Up Payouts</h1>
                <p className="mb-6">
                  Confirm payout setup has been completed for this provider. This marks onboarding as active.
                </p>
                <button
                type="button"
                onClick={completePayoutSetup}
                disabled={saving}
                className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-semibold"
                >
                {saving ? 'Saving...' : 'Finish Setup'}
                </button>
            </div>
        );
      case 'done':
        return (
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">All Set!</h1>
                <p>This provider is now active. You can manage territories and swaps from the admin portal.</p>
            </div>
        );
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
      {renderStep()}
    </div>
  );
};
