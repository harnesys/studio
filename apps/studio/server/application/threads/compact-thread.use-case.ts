import type { CompactThreadResponse } from '../../../shared/thread.ts';

export type CompactThreadRequest = {
  threadId: string;
};

export type CompactThreadInput = {
  execute(request: CompactThreadRequest): Promise<CompactThreadResponse>;
};

export class CompactThreadUseCase implements CompactThreadInput {
  async execute(_request: CompactThreadRequest): Promise<CompactThreadResponse> {
    // Stub: compaction will be re-added in 0.8.0 with host tools
    return { compacted: false };
  }
}
