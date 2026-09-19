import type { ComponentType } from 'react';

import { ConfirmAlert, type ConfirmAlertVariant } from './confirm-alert';
import { useOverlayStore } from './store';
import type { AlertComponentProps, AlertOptions } from './types';

export function openAlert<TResult, TData = unknown>(
  component: ComponentType<AlertComponentProps<TResult, TData>>,
  options: AlertOptions<TData>,
): Promise<TResult | null> {
  return new Promise<TResult | null>((resolve) => {
    useOverlayStore
      .getState()
      .open(
        'alert',
        component as ComponentType<AlertComponentProps<unknown, unknown>>,
        options,
        (value?: unknown) => {
          resolve((value ?? null) as TResult | null);
          useOverlayStore.getState().close();
        },
      );
  });
}

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmAlertVariant;
  testId?: string;
};

function confirm(options: ConfirmOptions): Promise<boolean> {
  return openAlert(ConfirmAlert, {
    title: options.title,
    description: options.description,
    testId: options.testId,
    data: {
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      variant: options.variant,
    },
  }).then((result) => !!result);
}

export const alert = {
  open: openAlert,
  confirm,
};
