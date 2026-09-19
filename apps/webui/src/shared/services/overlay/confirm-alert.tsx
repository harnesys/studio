import { AlertDialogAction, AlertDialogCancel, AlertDialogFooter } from '@/shared/ui/alert-dialog';

import type { AlertComponentProps } from './types';

export type ConfirmAlertVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';

export type ConfirmAlertData = {
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmAlertVariant;
};

export function ConfirmAlert({ onResolve, data }: AlertComponentProps<boolean, ConfirmAlertData>) {
  const { confirmText = 'Confirm', cancelText = 'Cancel', variant = 'default' } = data ?? {};

  return (
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => onResolve?.(false)}>{cancelText}</AlertDialogCancel>
      <AlertDialogAction variant={variant} onClick={() => onResolve?.(true)}>
        {confirmText}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}
