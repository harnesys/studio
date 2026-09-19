import type { ProviderPublic } from '@harnesys/studio-shared';
import type { LlmModelRepository, LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { requireProvider, toProviderPublic } from './provider.helpers.ts';
export type GetProviderRequest = {
  workspaceId: string;
  id: string;
};
export type GetProviderInput = {
  execute(request: GetProviderRequest): Promise<ProviderPublic>;
};
export class GetProviderUseCase implements GetProviderInput {
  constructor(
    private readonly providers: LlmProviderRepository,
    private readonly models: LlmModelRepository,
  ) {}
  execute(request: GetProviderRequest): Promise<ProviderPublic> {
    const provider = requireProvider(this.providers, request.workspaceId, request.id);
    const models = this.models.listByProvider(provider.id);
    return Promise.resolve(toProviderPublic(provider, models));
  }
}
