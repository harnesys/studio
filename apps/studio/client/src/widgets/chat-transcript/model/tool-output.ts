import type { SessionEvent } from '@studio/shared';
import { toolCaption } from './tool-caption';
import type { ToolDetail } from './tool-detail-types';
import { asObject, has, parseJson } from './tool-json';
import { isDiffOutput, parseDiffDetail } from './tool-output-diff';
import {
  isFileOutput,
  isGlobOutput,
  isGrepOutput,
  isListDirOutput,
  parseFileDetail,
  parseGlobDetail,
  parseGrepDetail,
  parseListDirDetail,
} from './tool-output-file';
import {
  isHttpOutput,
  isShellOutput,
  parseGenericDetail,
  parseHttpDetail,
  parseTerminalDetail,
  parseWriteFileDetail,
} from './tool-output-shell';

export type {
  CodeLine,
  DiffDetail,
  DiffHunk,
  DiffHunkLine,
  EntriesDetail,
  FileDetail,
  GenericDetail,
  GrepDetail,
  GrepMatchItem,
  HttpDetail,
  ListEntryItem,
  TerminalDetail,
  ToolDetail,
} from './tool-detail-types';
export { detectLanguage, toolMeta } from './tool-detail-types';

function toolInput(call: SessionEvent & { type: 'tool' }): string {
  const input = call.input;
  if (input == null) {
    return '';
  }
  return typeof input === 'string' ? input : JSON.stringify(input);
}

function toolOutput(result: SessionEvent & { type: 'tool' }): string {
  const output = result.output;
  if (output == null) {
    return '';
  }
  return typeof output === 'string' ? output : JSON.stringify(output);
}

export function toolDetail(
  call: SessionEvent & { type: 'tool' },
  result?: SessionEvent & { type: 'tool' },
): ToolDetail {
  const caption = toolCaption(call, result);
  const inputStr = toolInput(call);
  const input = asObject(parseJson(inputStr));
  const done = result
    ? result.phase === 'completed' || result.phase === 'failed'
    : call.phase === 'completed' || call.phase === 'failed';
  const rawOutput = result ? toolOutput(result) : '';
  const output = done ? parseJson(rawOutput) : undefined;
  const outputObj = asObject(output);
  const toolName = call.name;

  if ((done && toolName === 'edit_file') || isDiffOutput(outputObj, rawOutput)) {
    const parsedDiff = parseDiffDetail(outputObj, rawOutput, input);
    if (parsedDiff) {
      return parsedDiff;
    }
  }

  if ((done && toolName === 'read_file') || isFileOutput(outputObj)) {
    const file = parseFileDetail(outputObj, rawOutput, input, caption.hint);
    if (file) {
      return file;
    }
  }

  if ((done && toolName === 'list_dir') || isListDirOutput(outputObj)) {
    return parseListDirDetail(outputObj, input);
  }

  if ((done && toolName === 'glob') || isGlobOutput(outputObj)) {
    return parseGlobDetail(outputObj, input);
  }

  if ((done && toolName === 'grep') || isGrepOutput(outputObj)) {
    return parseGrepDetail(outputObj, input);
  }

  if ((done && toolName === 'shell') || isShellOutput(outputObj)) {
    return parseTerminalDetail(outputObj, rawOutput, input);
  }

  if ((done && (toolName === 'http' || toolName === 'fetch')) || isHttpOutput(outputObj)) {
    return parseHttpDetail(outputObj, input);
  }

  if (done && toolName === 'write_file' && outputObj && has(outputObj, 'bytes')) {
    return parseWriteFileDetail(outputObj, input, caption.title);
  }

  return parseGenericDetail(output, rawOutput, caption.title);
}

export function formatToolInput(raw: string | undefined): {
  json: boolean;
  formatted: string;
} {
  if (!raw || raw.trim().length === 0) {
    return { json: false, formatted: '(no input parameters)' };
  }
  const parsed = parseJson(raw);
  if (parsed !== undefined) {
    return { json: true, formatted: JSON.stringify(parsed, null, 2) };
  }
  return { json: false, formatted: raw };
}
