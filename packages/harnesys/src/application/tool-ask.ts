import type { AskUserInterrupt } from '../domain/errors.ts';

// Ask_user resumes are routed per call: the interrupt id is `ask/{toolCallId}`,
// and a call sees the resume payload only when the ids match. Without the match
// every parallel ask_user in the batch consumes the same answer (broadcast).
export function isAskResumeForCall(resumeInterruptId: string | undefined, callId: string): boolean {
  return resumeInterruptId === `ask/${callId}`;
}

export function ensureAskInterruptId(e: AskUserInterrupt, callId: string): void {
  if (!e.interruptId) {
    e.interruptId = `ask/${callId}`;
  }
}
