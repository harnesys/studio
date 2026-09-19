import type { FileOption, FileOptionSource } from './file-source';
import type { SkillOption } from './skill-source';
import type { SlashCommand } from './slash-commands';
import { SLASH_COMMANDS } from './slash-commands';
export function commandItems(query: string): SlashCommand[] {
  const normalized = query.toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(normalized));
}
const MAX_FILE_ITEMS = 20;
export function fileItems(query: string, options: FileOption[]): FileOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return options.slice(0, MAX_FILE_ITEMS);
  }
  const scored: {
    option: FileOption;
    score: number;
  }[] = [];
  for (const option of options) {
    const score = matchFileScore(normalized, option.ref);
    if (score >= 0) {
      scored.push({ option, score });
    }
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      sourceRank(a.option.source) - sourceRank(b.option.source) ||
      a.option.ref.length - b.option.ref.length ||
      compareRefs(a.option.ref, b.option.ref),
  );
  return scored.slice(0, MAX_FILE_ITEMS).map((item) => item.option);
}
function matchFileScore(query: string, ref: string): number {
  const lower = ref.toLowerCase();
  const slash = lower.lastIndexOf('/');
  const name = slash >= 0 ? lower.slice(slash + 1) : lower;
  if (name.startsWith(query)) {
    return 0;
  }
  if (name.includes(query)) {
    return 1;
  }
  if (lower.includes(query)) {
    return 2;
  }
  return -1;
}
function compareRefs(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
function sourceRank(source: FileOptionSource): number {
  switch (source) {
    case 'upload':
      return 0;
    case 'attachment':
      return 1;
    case 'workspace':
      return 2;
  }
}
export function pickerItems(query: string, options: SkillOption[]): SkillOption[] {
  const normalized = query.toLowerCase();
  return options.filter(
    (option) =>
      option.name.toLowerCase().includes(normalized) ||
      option.description.toLowerCase().includes(normalized),
  );
}
