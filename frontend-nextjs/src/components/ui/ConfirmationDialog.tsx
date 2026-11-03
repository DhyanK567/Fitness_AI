'use client';

import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangleIcon } from './icons';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = true,
  isLoading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
            isDestructive
              ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
              : 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
          }`}
        >
          <AlertTriangleIcon size="md" />
        </div>
        <div>
          <h4 className="text-base font-bold text-sand-900 dark:text-white tracking-tight">
            {title}
          </h4>
          <p className="mt-1 text-xs sm:text-sm text-sand-600 dark:text-sand-400 leading-relaxed">
            {message}
          </p>
        </div>
      </div>
    </Modal>
  );
};
