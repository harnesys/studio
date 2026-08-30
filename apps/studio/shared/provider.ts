import type { Driver, StudioModel, StudioModelView } from './catalog.ts';

export type ProviderRecord = {
  id: string;
  name: string;
  driver: Driver;
  apiUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  models: StudioModel[];
};

export type ProviderPublic = Omit<ProviderRecord, 'apiKey' | 'models'> & {
  hasKey: boolean;
  models: ProviderModelPublic[];
};

export type ProviderModelPublic = Omit<StudioModelView, 'kind'> & {
  kind: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};
