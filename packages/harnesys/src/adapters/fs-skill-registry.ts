import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvalidSkillFileError, parseSkillFile } from '../application/skills/parse-skill-file.ts';
import type { SkillDocument, SkillSummary } from '../domain/skill.ts';
import type { SkillRegistry } from '../ports/skills.ts';

export type FsSkillRegistryOptions = {
  roots: string[];
};

export class FsSkillRegistry implements SkillRegistry {
  readonly #roots: string[];
  #docs = new Map<string, SkillDocument>();

  constructor(options: FsSkillRegistryOptions) {
    this.#roots = options.roots;
    this.reload();
  }

  reload(): void {
    const docs = new Map<string, SkillDocument>();
    for (const root of this.#roots) {
      scanRootInto(docs, root);
    }
    this.#docs = docs;
  }

  list(): SkillSummary[] {
    return [...this.#docs.values()].map(({ name, description, whenToUse }) => ({
      name,
      description,
      ...(whenToUse !== undefined ? { whenToUse } : {}),
    }));
  }

  load(id: string): unknown {
    const doc = this.#docs.get(id);
    if (doc === undefined) {
      throw new Error(`unknown skill: ${id}`);
    }
    return doc;
  }
}

function listSkillMarkdownPaths(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  let names: string[];
  try {
    names = readdirSync(root);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidSkillFileError(message, root);
  }
  const paths: string[] = [];
  for (const name of names) {
    const skillPath = join(root, name, 'SKILL.md');
    if (existsSync(skillPath)) {
      paths.push(skillPath);
    }
  }
  return paths;
}

function loadSkillDocument(path: string): SkillDocument {
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new InvalidSkillFileError(message, path);
  }
  return parseSkillFile(content, path);
}

function scanRootInto(docs: Map<string, SkillDocument>, root: string): void {
  for (const path of listSkillMarkdownPaths(root)) {
    try {
      const doc = loadSkillDocument(path);
      docs.set(doc.name, doc);
    } catch {
      // Skip malformed skill files; valid siblings stay available.
    }
  }
}
