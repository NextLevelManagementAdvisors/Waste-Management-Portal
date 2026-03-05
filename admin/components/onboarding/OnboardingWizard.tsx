import React, { useState } from 'react';
import { TerritoryStep } from './TerritoryStep';

type OnboardingStep = 'welcome' | 'territory' | 'payouts' | 'done';

export const OnboardingWizard: React.FC = () => {
  const [step, setStep] = useState<OnboardingStep>('welcome');

  const onTerritoryDefined = () => {
    setStep('payouts');
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <div>
            <h1 className="text-2xl font-bold mb-4">Welcome, Provider!</h1>
            <p className="mb-6">Let's get your service set up so you can start accepting jobs.</p>
            <button
              onClick={() => setStep('territory')}
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-semibold"
            >
              Get Started
            </button>
          </div>
        );
      case 'territory':
        return <TerritoryStep onComplete={onTerritoryDefined} />;
      case 'payouts':
        return (
            <div>
                <h1 className="text-2xl font-bold mb-4">Set Up Payouts</h1>
                <p className="mb-6">Connect your bank account to receive payments for completed routes. (Placeholder)</p>
                <button
                onClick={() => setStep('done')}
                className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 font-semibold"
                >
                Finish Setup
                </button>
            </div>
        );
      case 'done':
        return (
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-4">All Set!</h1>
                <p>Your provider account is now active. You can now manage your business from the admin portal.</p>
            </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        {renderStep()}
      </div>
    </div>
  );
};
