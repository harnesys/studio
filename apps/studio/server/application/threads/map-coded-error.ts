import { NotFoundError, RunConflictError, ValidationError } from '../../domain/studio.error.ts';

const CONFLICT_CODES = new Set([
  'unknown_interrupt',
  'already_resumed',
  'run_terminal',
  'lease_stale',
  'already_queued',
]);

export function mapCodedError(error: unknown): Error {
  const code = (error as { code?: unknown }).code;
  const message = error instanceof Error ? error.message : 'run failed';
  if (code === 'resume_validation_failed') {
    return new ValidationError(message);
  }
  if (typeof code === 'string' && CONFLICT_CODES.has(code)) {
    return new RunConflictError({ code });
  }
  if (code === 'unknown_run') {
    return new NotFoundError(message);
  }
  return error instanceof Error ? error : new Error(message);
}
