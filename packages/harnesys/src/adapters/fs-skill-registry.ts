import type { Dirent } from 'node:fs';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { InvalidSkillFileError, parseSkillFile } from '../application/skills/parse-skill-file.ts';
import { MAX_SKILL_FILES } from '../constants.ts';
import type { SkillDocument, SkillFile, SkillSummary } from '../domain/skill.ts';
import type { SkillRegistry } from '../ports/skills.ts';

export type FsSkillRegistryOptions = {
  roots: string[];
};

type StoredSkill = {
  doc: SkillDocument;
  dir: string;
};

export class FsSkillRegistry implements SkillRegistry {
  readonly #roots: string[];
  #docs = new Map<string, StoredSkill>();

  constructor(options: FsSkillRegistryOptions) {
    this.#roots = options.roots;
    this.reload();
  }

  reload(): void {
    const docs = new Map<string, StoredSkill>();
    for (const root of this.#roots) {
      scanRootInto(docs, root);
    }
    this.#docs = docs;
  }

  list(): SkillSummary[] {
    return [...this.#docs.values()].map(({ doc: { name, description, whenToUse } }) => ({
      name,
      description,
      ...(whenToUse !== undefined ? { whenToUse } : {}),
    }));
  }

  load(id: string): unknown {
    const stored = this.#docs.get(id);
    if (stored === undefined) {
      throw new Error(`unknown skill: ${id}`);
    }
    return stored.doc;
  }

  loadFile(id: string, relPath: string): SkillFile {
    const stored = this.#docs.get(id);
    if (stored === undefined) {
      throw new Error(`unknown skill: ${id}`);
    }
    const absolute = resolveSkillFile(stored.dir, relPath);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(absolute);
    } catch {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    if (!stat.isFile()) {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    let raw: ReturnType<typeof readFileSync>;
    try {
      raw = readFileSync(absolute);
    } catch {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    if (isBinaryBuffer(raw.subarray(0, 8192))) {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    }
    return { path: relPath, content: raw.toString('utf8') };
  }
}

/** Skill-relative path resolved, never escaping the skill directory. */
function resolveSkillFile(dir: string, relPath: string): string {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error(`unknown skill file: ${relPath}`);
  }
  const absolute = resolve(dir, relPath);
  if (absolute !== dir && !absolute.startsWith(dir + sep)) {
    throw new Error(`unknown skill file: ${relPath}`);
  }
  return absolute;
}

function isBinaryBuffer(probe: Uint8Array): boolean {
  for (let i = 0; i < probe.byteLength; i += 1) {
    if (probe[i] === 0) {
      return true;
    }
  }
  return false;
}

/** Supporting files under the skill dir (`SKILL.md` excluded), sorted, capped. */
function listSkillFiles(dir: string): string[] {
  const out: string[] = [];
  const pending: string[] = [''];
  while (pending.length > 0 && out.length < MAX_SKILL_FILES) {
    const prefix = pending.pop();
    if (prefix === undefined) {
      break;
    }
    const { subdirs, subfiles } = splitDirEntries(join(dir, prefix), prefix);
    pending.push(...subdirs);
    for (const file of subfiles) {
      if (out.length >= MAX_SKILL_FILES) {
        break;
      }
      out.push(file);
    }
  }
  return out.sort();
}

function splitDirEntries(abs: string, prefix: string): { subdirs: string[]; subfiles: string[] } {
  const subdirs: string[] = [];
  const subfiles: string[] = [];
  for (const entry of readDirEntries(abs)) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      subdirs.push(rel);
    } else if (entry.isFile() && rel !== 'SKILL.md') {
      subfiles.push(rel);
    }
  }
  return { subdirs, subfiles };
}

function readDirEntries(current: string): Dirent[] {
  try {
    const entries = readdirSync(current, { withFileTypes: true });
    return [...entries].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
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

function scanRootInto(docs: Map<string, StoredSkill>, root: string): void {
  for (const path of listSkillMarkdownPaths(root)) {
    try {
      const doc = loadSkillDocument(path);
      const dir = dirname(path);
      docs.set(doc.name, { doc: { ...doc, files: listSkillFiles(dir) }, dir });
    } catch {
      // Skip malformed skill files; valid siblings stay available.
    }
  }
}
