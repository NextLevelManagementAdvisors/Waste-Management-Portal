import React from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';

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
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

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
