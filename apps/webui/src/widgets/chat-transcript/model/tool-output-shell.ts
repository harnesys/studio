import { detectLanguage, textToLines } from '@/shared/lib/tool-code';

import type { FileDetail, GenericDetail, HttpDetail, TerminalDetail } from './tool-detail-types';
import { has, type JsonObject, str } from './tool-json';

export function isShellOutput(obj: JsonObject | undefined): boolean {
  return obj !== undefined && (has(obj, 'stdout') || has(obj, 'exitCode'));
}

export function parseTerminalDetail(
  obj: JsonObject | undefined,
  raw: string,
  input: JsonObject | undefined,
): TerminalDetail {
  const command = (input ? str(input, 'command') : undefined) ?? '';
  const stdout = obj ? (str(obj, 'stdout') ?? '') : '';
  const stderr = obj ? (str(obj, 'stderr') ?? '') : '';
  const output = [stdout, stderr].filter((p) => p.length > 0).join('\n') || raw || '(empty output)';
  const exitCode = obj && typeof obj.exitCode === 'number' ? obj.exitCode : undefined;
  const durationMs = obj && typeof obj.durationMs === 'number' ? obj.durationMs : undefined;
  return { type: 'terminal', command, output, exitCode, durationMs };
}

export function isHttpOutput(obj: JsonObject | undefined): boolean {
  return obj !== undefined && typeof obj.status === 'number' && has(obj, 'ok');
}

export function parseHttpDetail(
  obj: JsonObject | undefined,
  input: JsonObject | undefined,
): HttpDetail {
  const url = (input ? str(input, 'url') : undefined) ?? '';
  const method = (input ? str(input, 'method') : undefined) ?? 'GET';
  const status = obj && typeof obj.status === 'number' ? obj.status : 200;
  const ok = obj && typeof obj.ok === 'boolean' ? obj.ok : status >= 200 && status < 300;
  const statusText = obj ? str(obj, 'statusText') : undefined;
  const body = (obj ? str(obj, 'body') : undefined) ?? '';
  const durationMs = obj && typeof obj.durationMs === 'number' ? obj.durationMs : undefined;
  const headers =
    obj?.headers && typeof obj.headers === 'object'
      ? (obj.headers as Record<string, string>)
      : undefined;
  return { type: 'http', url, method, status, ok, statusText, headers, body, durationMs };
}

export function parseGenericDetail(output: unknown, raw: string, title: string): GenericDetail {
  let text = '';
  let language: string | undefined;

  if (output !== undefined) {
    if (typeof output === 'object') {
      text = JSON.stringify(output, null, 2);
      language = 'json';
    } else {
      text = String(output);
    }
  } else {
    text = raw || '(no output)';
  }

  return {
    type: 'generic',
    title,
    language,
    text,
    lines: textToLines(text),
  };
}

export function parseWriteFileDetail(
  outputObj: JsonObject,
  input: JsonObject | undefined,
  title: string,
): FileDetail | GenericDetail {
  const pathStr = str(outputObj, 'path') ?? str(input, 'path') ?? '';
  const contentStr = str(input, 'content') ?? '';
  if (contentStr) {
    return {
      type: 'file',
      path: pathStr,
      language: detectLanguage(pathStr),
      lines: textToLines(contentStr),
      rawContent: contentStr,
    };
  }
  const bytes = typeof outputObj.bytes === 'number' ? outputObj.bytes : undefined;
  const created = outputObj.created === true || outputObj.ok === true;
  const label = created ? 'Created' : 'Wrote';
  const size = bytes != null ? ` (${bytes} bytes)` : '';
  const summary = pathStr ? `${label} ${pathStr}${size}` : `${label} file${size}`;
  return parseGenericDetail(undefined, summary, title);
}
