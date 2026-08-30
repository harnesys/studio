import type { TranscriptActivity } from '@studio/shared';
import { stepInputText, stepText } from '@studio/shared';
import { toolCallName, toolCaption } from './tool-caption';
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

export function toolDetail(item: Extract<TranscriptActivity, { type: 'tool' }>): ToolDetail {
  const caption = toolCaption(item);
  const input = asObject(parseJson(stepInputText(item.call)));
  const done = item.result
    ? item.result.status === 'completed' || item.result.status === 'failed'
    : item.call.status === 'completed' || item.call.status === 'failed';
  const rawOutput = item.result ? stepText(item.result) : '';
  const output = done ? parseJson(rawOutput) : undefined;
  const outputObj = asObject(output);
  const toolName = toolCallName(item);

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
