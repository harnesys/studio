import type { LlmProviderRepository } from '../../domain/llm-provider.port.ts';
import { requireProvider } from './provider.helpers.ts';

export type DeleteProviderRequest = {
  id: string;
};

export type DeleteProviderInput = {
  execute(request: DeleteProviderRequest): Promise<void>;
};

export class DeleteProviderUseCase implements DeleteProviderInput {
  constructor(private readonly providers: LlmProviderRepository) {}

  async execute(request: DeleteProviderRequest): Promise<void> {
    requireProvider(this.providers, request.id);
    this.providers.delete(request.id);
    await Promise.resolve();
  }
}
