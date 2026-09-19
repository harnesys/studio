import type { CodeLine, DiffDetail } from '@/shared/lib/tool-code';

export type {
  CodeLine,
  DiffDetail,
  DiffHunk,
  DiffHunkLine,
} from '@/shared/lib/tool-code';
export { detectLanguage } from '@/shared/lib/tool-code';

export type FileDetail = {
  type: 'file';
  path: string;
  language?: string;
  totalLines?: number;
  truncated?: boolean;
  lines: CodeLine[];
  rawContent: string;
};

export type ListEntryItem = {
  name: string;
  type: 'file' | 'dir';
  size?: number;
};

export type EntriesDetail = {
  type: 'entries';
  path?: string;
  pattern?: string;
  truncated?: boolean;
  items: ListEntryItem[];
};

export type GrepMatchItem = {
  file: string;
  line: number;
  text: string;
};

export type GrepDetail = {
  type: 'grep';
  pattern: string;
  matches: GrepMatchItem[];
  truncated?: boolean;
};

export type TerminalDetail = {
  type: 'terminal';
  command: string;
  output: string;
  exitCode?: number;
  durationMs?: number;
};

export type HttpDetail = {
  type: 'http';
  url: string;
  method: string;
  status: number;
  ok: boolean;
  statusText?: string;
  headers?: Record<string, string>;
  body: string;
  durationMs?: number;
};

export type GenericDetail = {
  type: 'generic';
  title: string;
  language?: string;
  text: string;
  lines: CodeLine[];
};

export type ToolDetail =
  | DiffDetail
  | FileDetail
  | EntriesDetail
  | GrepDetail
  | TerminalDetail
  | HttpDetail
  | GenericDetail;

export function toolMeta(detail: ToolDetail): string[] {
  switch (detail.type) {
    case 'terminal':
      return detail.exitCode !== undefined ? [`exit ${detail.exitCode}`] : [];
    case 'http': {
      const status = detail.statusText
        ? `${detail.status} ${detail.statusText}`
        : String(detail.status);
      return [detail.method, status];
    }
    case 'file': {
      const n = detail.totalLines ?? detail.lines.length;
      const label = `${n} ${n === 1 ? 'line' : 'lines'}`;
      return detail.truncated ? [`${label} · truncated`] : [label];
    }
    case 'diff': {
      const parts: string[] = [];
      if (detail.replacements != null) {
        parts.push(
          `${detail.replacements} ${detail.replacements === 1 ? 'replacement' : 'replacements'}`,
        );
      }
      parts.push(`+${detail.addedCount}`, `-${detail.deletedCount}`);
      return parts;
    }
    case 'entries': {
      const n = detail.items.length;
      const label = `${n} ${n === 1 ? 'item' : 'items'}`;
      return detail.truncated ? [`${label} · truncated`] : [label];
    }
    case 'grep': {
      const n = detail.matches.length;
      const label = `${n} ${n === 1 ? 'hit' : 'hits'}`;
      return detail.truncated ? [`${label} · truncated`] : [label];
    }
    case 'generic': {
      const n = detail.lines.length;
      return n > 0 ? [`${n} ${n === 1 ? 'line' : 'lines'}`] : [];
    }
  }
}
