import type { OnMount } from '@monaco-editor/react';
// @ts-expect-error monaco deep import without declarations
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js';
// @ts-expect-error monaco deep import without declarations
import { IConfigurationService } from 'monaco-editor/esm/vs/platform/configuration/common/configuration.js';

type Monaco = Parameters<OnMount>[1];
type LineSpan = { start: number; length: number };

const TAG_NAME_RE = /<\/?[A-Za-z][\w:.-]*/g;
const FRAGMENT_CLOSE_RE = /<\/(?=[\s>])/g;
const OPENERS = new Set(['(', ')', '{', '}', '[', ']', ';', ',', ':', '?', '&', '|', '=', '>']);
const TAIL_LIMIT = 64;

let registered = false;

function opensJsx(prefix: string): boolean {
  const trimmed = prefix.replace(/\s+$/, '');
  if (trimmed === '') {
    return true;
  }
  if (OPENERS.has(trimmed.slice(-1))) {
    return true;
  }
  return /(^|[^\w$])return$/.test(trimmed);
}

/** Find `/>` closing a tag whose attributes may hold strings and `{...}` expressions. */
function findSelfClose(text: string, from: number): number {
  let inString: string | null = null;
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (char === '\\') {
        i += 1;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && char === '>') {
      return text[i - 1] === '/' ? i - 1 : -1;
    }
  }
  return -1;
}

function collectLineSpans(text: string, tail: string): LineSpan[] {
  const spans: LineSpan[] = [];
  for (const match of text.matchAll(TAG_NAME_RE)) {
    const raw = match[0];
    const closing = raw.startsWith('</');
    if (closing || opensJsx(tail + text.slice(0, match.index))) {
      spans.push({ start: match.index, length: raw.length });
      if (!closing) {
        const close = findSelfClose(text, match.index + raw.length);
        if (close >= 0) {
          spans.push({ start: close, length: 2 });
        }
      }
    }
  }
  for (const match of text.matchAll(FRAGMENT_CLOSE_RE)) {
    spans.push({ start: match.index, length: 2 });
  }
  return spans;
}

export function ensureJsxTagSemanticTokens(monaco: Monaco) {
  if (registered) {
    return;
  }
  registered = true;
  const configuration = StandaloneServices.get(IConfigurationService);
  configuration.updateValues([['editor.semanticHighlighting.enabled', true]]);
  for (const languageId of ['typescript', 'javascript'] as const) {
    monaco.languages.registerDocumentSemanticTokensProvider(languageId, {
      getLegend() {
        return { tokenTypes: ['tag'], tokenModifiers: [] };
      },
      releaseDocumentSemanticTokens() {},
      provideDocumentSemanticTokens(model) {
        const path = model.uri.path.toLowerCase();
        if (!path.endsWith('.tsx') && !path.endsWith('.jsx')) {
          return { data: new Uint32Array(0) };
        }
        const out: number[] = [];
        let tail = '';
        let prevLine = 0;
        let prevChar = 0;
        const lineCount = model.getLineCount();
        for (let line = 1; line <= lineCount; line += 1) {
          const text = model.getLineContent(line);
          const spans = collectLineSpans(text, tail).sort((a, b) => a.start - b.start);
          let lastEnd = -1;
          const lineIndex = line - 1;
          for (const span of spans) {
            if (span.start < lastEnd) {
              continue;
            }
            lastEnd = span.start + span.length;
            out.push(
              lineIndex - prevLine,
              lineIndex === prevLine ? span.start - prevChar : span.start,
              span.length,
              0,
              0,
            );
            prevLine = lineIndex;
            prevChar = span.start;
          }
          tail = (tail + text).slice(-TAIL_LIMIT);
        }
        return { data: new Uint32Array(out) };
      },
    });
  }
}
