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
  cwd: string;
  path: string;
  line: number;
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
