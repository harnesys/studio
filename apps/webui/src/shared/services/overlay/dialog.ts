import type { ComponentType } from 'react';
import { useOverlayStore } from './store';
import type { DialogComponentProps, DialogOptions } from './types';
export function openDialog<TResult, TData = unknown>(
  component: ComponentType<DialogComponentProps<TResult, TData>>,
  options: DialogOptions<TData>,
): Promise<TResult | null> {
  return new Promise<TResult | null>((resolve) => {
    useOverlayStore
      .getState()
      .open(
        'dialog',
        component as ComponentType<DialogComponentProps<unknown, unknown>>,
        options,
        (value?: unknown) => {
          resolve((value ?? null) as TResult | null);
          useOverlayStore.getState().close();
        },
      );
  });
}
export const dialog = {
  open: openDialog,
};
