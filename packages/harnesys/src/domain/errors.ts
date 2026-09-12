import type { JsonSchema } from './json-schema.ts';

export type DiagnosticSeverity = 'error' | 'warning';

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  path?: string;
  message: string;
};

export class ValidationError extends Error {
  diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(`validation failed: ${diagnostics.map((d) => d.code).join(', ')}`);
    this.name = 'ValidationError';
    this.diagnostics = diagnostics;
  }
}

export class NotImplementedError extends Error {
  readonly method: string;
  constructor(method: string) {
    super(`Not implemented in harnesys@0.1.0: ${method}`);
    this.name = 'NotImplementedError';
    this.method = method;
  }
}

export class ThreadBusyError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`Thread ${sessionId} is busy (running or needs_input)`);
    this.name = 'ThreadBusyError';
    this.sessionId = sessionId;
  }
}

export class PendingHitlError extends Error {
  readonly sessionId: string;
  constructor(sessionId: string) {
    super(`Thread ${sessionId} has pending HITL ask`);
    this.name = 'PendingHitlError';
    this.sessionId = sessionId;
  }
}

export class ResumeHashError extends Error {
  readonly expected: string;
  readonly actual: string;
  constructor(expected: string, actual: string) {
    super(`Definition hash mismatch: expected ${expected}, got ${actual}`);
    this.name = 'ResumeHashError';
    this.expected = expected;
    this.actual = actual;
  }
}

export class AskUserInterrupt extends Error {
  readonly prompt: string;
  readonly source?: 'ask_user' | 'approve' | 'permission';
  readonly tool?: { name: string; input: unknown; toolCallId: string };
  interruptId?: string;
  readonly resumeSchema?: JsonSchema;

  constructor(input: {
    prompt: string;
    source?: 'ask_user' | 'approve' | 'permission';
    tool?: { name: string; input: unknown; toolCallId: string };
    interruptId?: string;
    resumeSchema?: JsonSchema;
  }) {
    super('ask_user interrupt');
    this.name = 'AskUserInterrupt';
    this.prompt = input.prompt;
    this.source = input.source;
    this.tool = input.tool;
    this.interruptId = input.interruptId;
    this.resumeSchema = input.resumeSchema;
  }
}

export type CodedError = Error & { code: string };

export function codedRunError(code: string, message: string): CodedError {
  return Object.assign(new Error(message), { code }) as CodedError;
}
