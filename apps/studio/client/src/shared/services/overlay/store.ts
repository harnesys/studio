import type { ComponentType } from 'react';
import { create } from 'zustand';

import type { OverlayComponentProps, OverlayKind, OverlayOptions, OverlayState } from './types';

const empty: OverlayState = {
  kind: null,
  component: null,
  options: null,
  resolver: null,
};

type OverlayStore = OverlayState & {
  open: (
    kind: OverlayKind,
    component: ComponentType<OverlayComponentProps<unknown, unknown>>,
    options: OverlayOptions,
    resolver: (value?: unknown) => void,
  ) => void;
  close: () => void;
};

export const useOverlayStore = create<OverlayStore>((set) => ({
  ...empty,
  open(kind, component, options, resolver) {
    set({ kind, component, options, resolver });
  },
  close() {
    set(empty);
  },
}));
