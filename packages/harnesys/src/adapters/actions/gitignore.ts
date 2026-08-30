import path from 'path';

export type GitIgnore = {
  ignores(absolutePath: string): boolean;
};

type Rule = {
  negated: boolean;
  dirOnly: boolean;
  rooted: boolean;
  pattern: string;
};

export async function loadGitignore(workdir: string): Promise<GitIgnore> {
  const text = await Bun.file(path.join(workdir, '.gitignore'))
    .text()
    .catch(() => '');
  const rules = parseGitignore(text);
  return {
    ignores(absolutePath) {
      const relative = toPosix(path.relative(workdir, absolutePath));
      if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
        return false;
      }
      return isIgnored(relative, rules);
    },
  };
}

function parseGitignore(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    let dirOnly = false;
    if (pattern.endsWith('/')) {
      dirOnly = true;
      pattern = pattern.slice(0, -1);
    }
    let rooted = false;
    if (pattern.startsWith('/')) {
      rooted = true;
      pattern = pattern.slice(1);
    }
    if (pattern.length === 0) {
      continue;
    }
    rules.push({ negated, dirOnly, rooted, pattern });
  }
  return rules;
}

function isIgnored(relative: string, rules: Rule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (ruleMatches(rule, relative)) {
      ignored = !rule.negated;
    }
  }
  if (ignored) {
    return true;
  }
  const parent = parentOf(relative);
  return parent !== undefined && isIgnored(parent, rules);
}

function ruleMatches(rule: Rule, relative: string): boolean {
  const targets =
    rule.rooted || rule.pattern.includes('/')
      ? [relative]
      : [relative, path.posix.basename(relative)];
  for (const target of targets) {
    if (globMatch(rule.pattern, target)) {
      return true;
    }
    if (rule.dirOnly && globMatch(`${rule.pattern}/**`, target)) {
      return true;
    }
  }
  return false;
}

function globMatch(pattern: string, value: string): boolean {
  return new Bun.Glob(pattern).match(value);
}

function parentOf(relative: string): string | undefined {
  const index = relative.lastIndexOf('/');
  return index > 0 ? relative.slice(0, index) : undefined;
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
