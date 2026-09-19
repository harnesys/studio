import type { RuntimeState } from 'harnesys';
export type RuntimeStateRepository = {
  forState(threadId: string): RuntimeState;
};
