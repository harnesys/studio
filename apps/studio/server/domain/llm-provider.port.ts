export type LlmProvider = {
  id: string;
  name: string;
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LlmProviderInsert = {
  id: string;
  name: string;
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LlmProviderPatch = Partial<{
  name: string;
  driver: string;
  apiUrl: string | null;
  apiKey: string | null;
  headers: Record<string, string>;
  enabled: boolean;
}>;

export type LlmProviderRepository = {
  list(): LlmProvider[];
  findById(id: string): LlmProvider | undefined;
  findByName(name: string): LlmProvider | undefined;
  insert(rec: LlmProviderInsert): LlmProvider;
  update(id: string, patch: LlmProviderPatch): LlmProvider;
  delete(id: string): void;
};

export type LlmModel = {
  id: string;
  providerId: string;
  name: string;
  kind: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type LlmModelInsert = {
  id: string;
  providerId: string;
  name: string;
  kind: string;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
};

export type LlmModelPatch = Partial<{
  name: string;
  kind: string;
  metadata: unknown;
}>;

export type LlmModelRepository = {
  listByProvider(providerId: string): LlmModel[];
  findById(id: string): LlmModel | undefined;
  findByProviderAndName(providerId: string, name: string): LlmModel | undefined;
  insert(rec: LlmModelInsert): LlmModel;
  update(id: string, patch: LlmModelPatch): LlmModel;
  delete(id: string): void;
};
