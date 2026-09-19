import type { LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { requireProvider } from './provider.helpers.ts';
export type DeleteProviderRequest = {
  workspaceId: string;
  id: string;
};
export type DeleteProviderInput = {
  execute(request: DeleteProviderRequest): Promise<void>;
};
export class DeleteProviderUseCase implements DeleteProviderInput {
  constructor(private readonly providers: LlmProviderRepository) {}
  async execute(request: DeleteProviderRequest): Promise<void> {
    requireProvider(this.providers, request.workspaceId, request.id);
    this.providers.delete(request.workspaceId, request.id);
    await Promise.resolve();
  }
}
