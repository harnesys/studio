import { CHARS_PER_TOKEN_ESTIMATE } from '../../config/constants.ts';
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}
export function fitLinesToBudget(lines: string[], budgetTokens: number): string {
  if (budgetTokens <= 0 || lines.length === 0) {
    return '';
  }
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = estimateTokens(kept.length === 0 ? line : `\n${line}`);
    if (used + cost > budgetTokens) {
      break;
    }
    kept.push(line);
    used += cost;
  }
  return kept.join('\n');
}
