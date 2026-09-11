export type LspDiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

export type LspDiagnostic = {
  path: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  severity: LspDiagnosticSeverity;
  message: string;
  source?: string;
  code?: string;
};

export type LspLocation = {
  path: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
};

export type LspHover = {
  contents: string;
  range?: {
    line: number;
    character: number;
    endLine: number;
    endCharacter: number;
  };
};

export type LspPositionRequest = {
  /** Workspace / thread cwd (absolute). */
  cwd: string;
  /** Path relative to cwd or absolute under cwd. */
  path: string;
  /** 0-based line. */
  line: number;
  /** 0-based character. */
  character: number;
};

export type LspDiagnosticsRequest = {
  cwd: string;
  path: string;
};

export type LspPort = {
  diagnostics(request: LspDiagnosticsRequest): Promise<LspDiagnostic[]>;
  definition(request: LspPositionRequest): Promise<LspLocation[]>;
  references(request: LspPositionRequest): Promise<LspLocation[]>;
  hover(request: LspPositionRequest): Promise<LspHover | null>;
};
