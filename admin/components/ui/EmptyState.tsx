import React from 'react';
import { Button } from '../../../components/Button.tsx';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  action,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    {icon && (
      <div className="mb-4 text-gray-300">
        {icon}
      </div>
    )}
    {title && (
      <h3 className="text-lg font-black text-gray-900 mb-2">{title}</h3>
    )}
    <p className="text-gray-500 mb-6 max-w-sm">{message}</p>
    {action && (
      <Button onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
);
