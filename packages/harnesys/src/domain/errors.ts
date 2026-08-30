export class NotImplementedError extends Error {
  readonly method: string;
  constructor(method: string) {
    super(`Not implemented in harnesys@0.1.0: ${method}`);
    this.name = 'NotImplementedError';
    this.method = method;
  }
}
