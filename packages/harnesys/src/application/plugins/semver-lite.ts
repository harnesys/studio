export type Semver = {
  major: number;
  minor: number;
  patch: number;
};
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
function parseSemver(value: string): Semver | undefined {
  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}
function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) {
    return a.major < b.major ? -1 : 1;
  }
  if (a.minor !== b.minor) {
    return a.minor < b.minor ? -1 : 1;
  }
  if (a.patch !== b.patch) {
    return a.patch < b.patch ? -1 : 1;
  }
  return 0;
}
export function semverSatisfies(version: string, range: string): boolean {
  const subject = parseSemver(version);
  const trimmed = range.trim();
  let operator: '>=' | '~' | '^' | '=' = '=';
  let body = trimmed;
  if (trimmed.startsWith('>=')) {
    operator = '>=';
    body = trimmed.slice(2);
  } else if (trimmed.startsWith('~')) {
    operator = '~';
    body = trimmed.slice(1);
  } else if (trimmed.startsWith('^')) {
    operator = '^';
    body = trimmed.slice(1);
  } else if (trimmed.startsWith('=')) {
    body = trimmed.slice(1);
  }
  const base = parseSemver(body);
  if (!subject || !base) {
    return false;
  }
  if (operator === '=') {
    return compareSemver(subject, base) === 0;
  }
  if (compareSemver(subject, base) < 0) {
    return false;
  }
  if (operator === '>=') {
    return true;
  }
  return compareSemver(subject, rangeUpperBound(base, operator)) < 0;
}
function rangeUpperBound(base: Semver, operator: '~' | '^'): Semver {
  if (operator === '~') {
    return { major: base.major, minor: base.minor + 1, patch: 0 };
  }
  if (base.major > 0) {
    return { major: base.major + 1, minor: 0, patch: 0 };
  }
  if (base.minor > 0) {
    return { major: 0, minor: base.minor + 1, patch: 0 };
  }
  return { major: 0, minor: 0, patch: base.patch + 1 };
}
