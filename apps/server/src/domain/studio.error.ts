export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
export class UnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnavailableError';
  }
}
export type RunConflictBody = {
  code?: string;
  runId?: string;
  pendingAskId?: string;
};
export class RunConflictError extends Error {
  constructor(readonly body: RunConflictBody) {
    super('run conflict');
    this.name = 'RunConflictError';
  }
}
