import type { ThreadPlanRecord } from '@harnesys/studio-shared';
import { ValidationError } from '../../domain/studio.error.ts';
import type { UnitOfWork } from '../../domain/unit-of-work.port.ts';

export type GetThreadPlanRequest = {
  threadId: string;
};

export type GetThreadPlanInput = {
  execute(request: GetThreadPlanRequest): Promise<ThreadPlanRecord | null>;
};

export class GetThreadPlanUseCase implements GetThreadPlanInput {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(request: GetThreadPlanRequest): Promise<ThreadPlanRecord | null> {
    if (!request.threadId?.trim()) {
      throw new ValidationError('threadId is required');
    }

    const plan = this.uow.run(({ plans }) => {
      return plans.getByThreadId(request.threadId);
    });

    return await Promise.resolve(plan);
  }
}
