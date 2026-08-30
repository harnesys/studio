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
