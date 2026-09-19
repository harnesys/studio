import type { AskUserInterrupt } from '../domain/errors.ts';
export function isAskResumeForCall(resumeInterruptId: string | undefined, callId: string): boolean {
  return resumeInterruptId === `ask/${callId}`;
}
export function ensureAskInterruptId(e: AskUserInterrupt, callId: string): void {
  if (!e.interruptId) {
    e.interruptId = `ask/${callId}`;
  }
}
