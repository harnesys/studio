export type LlmProvider = {
  id: string;
  workspaceId: string;
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
  workspaceId: string;
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
  list(workspaceId: string): LlmProvider[];
  findById(workspaceId: string, id: string): LlmProvider | undefined;
  findByName(workspaceId: string, name: string): LlmProvider | undefined;
  insert(rec: LlmProviderInsert): LlmProvider;
  update(workspaceId: string, id: string, patch: LlmProviderPatch): LlmProvider;
  delete(workspaceId: string, id: string): void;
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
