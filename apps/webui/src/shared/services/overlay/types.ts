import type { ComponentType } from 'react';
export type OverlayKind = 'dialog' | 'alert';
export type OverlayComponentProps<TResult = unknown, TData = unknown> = {
  onResolve?: (value?: TResult) => void;
  data?: TData;
};
export type OverlayOptions<T = unknown> = {
  title?: string;
  description?: string;
  cancellable?: boolean;
  data?: T;
  className?: string;
  testId?: string;
  size?: 'default' | 'sm';
};
export type DialogComponentProps<TResult = unknown, TData = unknown> = OverlayComponentProps<
  TResult,
  TData
>;
export type AlertComponentProps<TResult = unknown, TData = unknown> = OverlayComponentProps<
  TResult,
  TData
>;
export type DialogOptions<T = unknown> = OverlayOptions<T>;
export type AlertOptions<T = unknown> = OverlayOptions<T> & {
  title: string;
};
export type OverlayState = {
  kind: OverlayKind | null;
  component: ComponentType<OverlayComponentProps<unknown, unknown>> | null;
  options: OverlayOptions | null;
  resolver: ((value?: unknown) => void) | null;
};
