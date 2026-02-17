import React, { useState } from 'react';
import { Card } from '../../components/Card.tsx';
import { Button } from '../../components/Button.tsx';

// ============================================================================
// LoadingSpinner
// ============================================================================
export const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-600"></div>
  </div>
);

// ============================================================================
// StatCard
// ============================================================================
interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  icon, 
  accent = 'text-teal-700',
  onClick
}) => (
  <Card className={`p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-teal-200 transition-all group' : ''}`} onClick={onClick}>
    <div className="flex items-center justify-between">
      <div>
        <p className={`text-xs font-black uppercase tracking-widest text-gray-400 ${onClick ? 'group-hover:text-teal-600' : ''}`}>{label}</p>
        <p className={`text-2xl font-black mt-1 ${accent}`}>{value}</p>
      </div>
      <div className={`text-gray-300 ${onClick ? 'group-hover:text-teal-400 transition-colors' : ''}`}>{icon}</div>
    </div>
  </Card>
);

// ============================================================================
// Pagination
// ============================================================================
interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (newOffset: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  total,
  limit,
  offset,
  onChange,
}) => {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between py-4 px-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="text-sm text-gray-600">
        Showing <span className="font-bold">{offset + 1}</span> to <span className="font-bold">{Math.min(offset + limit, total)}</span> of <span className="font-bold">{total}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          ← Previous
        </Button>

        <div className="px-3 py-1 bg-white border border-gray-200 rounded text-sm font-semibold text-gray-700">
          {currentPage} / {totalPages}
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={!canNext}
          onClick={() => onChange(offset + limit)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
};

// ============================================================================
// StatusBadge
// ============================================================================
interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const statusLower = status.toLowerCase();

  const getStatusStyles = (status: string): string => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span
      className={`text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5 ${getStatusStyles(statusLower)} ${className}`}
    >
      {status}
    </span>
  );
};

// ============================================================================
// EmptyState
// ============================================================================
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

// ============================================================================
// FilterBar
// ============================================================================
interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, className = '' }) => (
  <div className={`flex flex-col sm:flex-row gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 ${className}`}>
    {children}
  </div>
);

// ============================================================================
// ConfirmDialog
// ============================================================================
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Modal */}
      <Card className="relative w-full max-w-md p-6 shadow-lg">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-black text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-2">{message}</p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              size="sm"
              disabled={isLoading}
              onClick={onCancel}
              className="flex-1"
            >
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              disabled={isLoading}
              onClick={onConfirm}
              className={`flex-1 ${isDangerous ? 'bg-red-600 hover:bg-red-700' : ''}`}
            >
              {isLoading ? 'Loading...' : confirmLabel}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
