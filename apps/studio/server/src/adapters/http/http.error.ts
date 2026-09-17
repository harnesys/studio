import type { StudioErrorBody } from '@harnesys/studio-shared';
import { ModelLookupError, PendingHitlError, ThreadBusyError } from 'harnesys';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import {
  GitBranchExistsError,
  GitBranchInvalidError,
  GitDirtyError,
  GitNotFoundError,
  GitTimeoutError,
} from '../../domain/git.error.ts';
import {
  ConflictError,
  NotFoundError,
  UnavailableError,
  ValidationError,
} from '../../domain/studio.error.ts';

export const handleHttpError: ErrorHandler = (err, c) => {
  const { status, error } = toStudioError(err);
  const body: StudioErrorBody = { error };
  return c.json(body, status);
};

function toStudioError(err: unknown): { status: ContentfulStatusCode; error: string } {
  if (err instanceof ZodError) {
    return { status: 400, error: zodMessage(err) };
  }
  if (err instanceof ValidationError) {
    return { status: 400, error: err.message };
  }
  if (err instanceof NotFoundError) {
    return { status: 404, error: err.message };
  }
  if (err instanceof UnavailableError) {
    return { status: 503, error: err.message };
  }
  if (err instanceof ConflictError || err instanceof ThreadBusyError) {
    return { status: 409, error: err.message };
  }
  if (err instanceof GitDirtyError || err instanceof GitBranchExistsError) {
    return { status: 409, error: err.message };
  }
  if (err instanceof GitBranchInvalidError) {
    return { status: 400, error: err.message };
  }
  if (err instanceof GitNotFoundError) {
    return { status: 503, error: err.message };
  }
  if (err instanceof GitTimeoutError) {
    return { status: 504, error: err.message };
  }
  if (err instanceof ModelLookupError || err instanceof PendingHitlError) {
    return { status: 400, error: err.message };
  }
  if (err instanceof HTTPException) {
    return { status: err.status, error: err.message };
  }
  return { status: 500, error: err instanceof Error ? err.message : 'internal' };
}

function zodMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) {
    return 'invalid body';
  }
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
