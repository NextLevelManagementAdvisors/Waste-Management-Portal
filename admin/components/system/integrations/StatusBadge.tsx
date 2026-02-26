import React from 'react';
import type { IntegrationTestResult } from './types';

interface StatusBadgeProps {
  result?: IntegrationTestResult;
  isTesting: boolean;
}

const STYLES: Record<IntegrationTestResult['status'], string> = {
  connected: 'bg-green-100 text-green-800',
  not_configured: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
};

const LABELS: Record<IntegrationTestResult['status'], string> = {
  connected: 'Connected',
  not_configured: 'Not Configured',
  error: 'Error',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ result, isTesting }) => {
  if (isTesting) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1">
        <span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
        Testing
      </span>
    );
  }
  if (!result) return null;
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STYLES[result.status]} cursor-help`}
      title={result.message + (result.latencyMs ? ` (${result.latencyMs}ms)` : '')}
    >
      {LABELS[result.status]}
    </span>
  );
};

export default StatusBadge;
