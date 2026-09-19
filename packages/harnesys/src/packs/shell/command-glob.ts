export function firstMatchingCommandPattern(
  command: string,
  patterns: readonly string[],
): string | undefined {
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (matchesCommandPattern(command, trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}
function matchesCommandPattern(command: string, pattern: string): boolean {
  const hasMagic = pattern.includes('*') || pattern.includes('?');
  if (!hasMagic) {
    return command === pattern;
  }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const source = `^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`;
  return new RegExp(source).test(command);
}
