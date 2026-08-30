export type ModelRecord = {
  name: string;
  [key: string]: unknown;
};

export type ProviderConfig = {
  name: string;
  driver: string;
  apiKey?: string;
  apiUrl?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  models: ModelRecord[];
};

export type ModelsPort = {
  // Host port; binding rules in docs/06. Shape filled when executor lands (0.2).
  providers?: ProviderConfig[];
};
