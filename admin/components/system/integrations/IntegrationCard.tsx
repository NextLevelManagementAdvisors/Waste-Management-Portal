import React, { useState } from 'react';
import { Card } from '../../../../components/Card.tsx';
import type { IntegrationTestResult, SectionConfig } from './types';
import StatusBadge from './StatusBadge.tsx';

interface IntegrationCardProps {
  section: SectionConfig;
  status?: IntegrationTestResult;
  isTesting: boolean;
  onTest: () => void;
  guide?: React.ReactNode;
  children: React.ReactNode;
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({
  section,
  status,
  isTesting,
  onTest,
  guide,
  children,
}) => {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h4 className="text-base font-black text-gray-900">{section.title}</h4>
          <StatusBadge result={status} isTesting={isTesting} />
          {guide && (
            <button
              onClick={() => setGuideOpen(!guideOpen)}
              className="text-xs font-semibold text-teal-600 hover:text-teal-800 flex items-center gap-1"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${guideOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              Setup Guide
            </button>
          )}
          <button
            onClick={onTest}
            disabled={isTesting}
            className="ml-auto text-xs font-semibold text-gray-500 hover:text-teal-600 disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Test
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
        {status?.status === 'error' && (
          <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {status.message}
          </div>
        )}
      </div>

      {guideOpen && guide && (
        <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-gray-700">
          {guide}
        </div>
      )}

      {children}
    </Card>
  );
};

export default IntegrationCard;
