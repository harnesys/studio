import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ATTACHMENTS_DIR,
  HOME_DIR_NAME,
  SKILLS_DIR,
  STUDIO_DIR,
  STUDIO_DIR_LEGACY,
  WORKSPACES_DIR,
} from '../../config/constants.ts';
import { env } from '../../config/env.ts';

export {
  ATTACHMENTS_DIR,
  DB_FILE,
  HOME_DIR_NAME,
  SKILLS_DIR,
  STUDIO_DIR,
  STUDIO_DIR_LEGACY,
  WORKSPACES_DIR,
} from '../../config/constants.ts';

export function defaultHomePath(): string {
  return env.harnesysHome ?? join(homedir(), HOME_DIR_NAME);
}

/** Host-wide skills for every workspace (`~/.harnesys/skills`). */
export function systemSkillsPath(home: string = defaultHomePath()): string {
  return join(home, SKILLS_DIR);
}

/**
 * Workspace meta root (`<workspace>/.harnesys`).
 * One-shot rename from legacy `.studio` when the new path is missing.
 */
export function studioDir(workspacePath: string): string {
  const next = join(workspacePath, STUDIO_DIR);
  const legacy = join(workspacePath, STUDIO_DIR_LEGACY);
  if (existsSync(legacy) && !existsSync(next)) {
    renameSync(legacy, next);
  }
  return next;
}

/**
 * Workspace skills (`<workspace>/.harnesys/skills`).
 * One-shot migrate from legacy `<workspace>/.agents/skills`.
 */
export function workspaceSkillsPath(workspacePath: string): string {
  const next = join(studioDir(workspacePath), SKILLS_DIR);
  const legacy = join(workspacePath, '.agents', 'skills');
  if (existsSync(legacy) && !existsSync(next)) {
    mkdirSync(studioDir(workspacePath), { recursive: true });
    renameSync(legacy, next);
  }
  mkdirSync(next, { recursive: true });
  return next;
}

/**
 * Skill registry roots: system first, workspace second.
 * Same skill name in the workspace overrides the system copy (`Map.set` last wins).
 */
export function skillRegistryRoots(workspacePath: string): string[] {
  const systemRoot = systemSkillsPath();
  mkdirSync(systemRoot, { recursive: true });
  return [systemRoot, workspaceSkillsPath(workspacePath)];
}

export function defaultWorkspacePath(home: string, name: string): string {
  const slug = name.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim() || 'workspace';
  return join(home, WORKSPACES_DIR, slug);
}

export function attachmentsDir(workspacePath: string, threadId: string): string {
  return join(studioDir(workspacePath), 'threads', threadId, ATTACHMENTS_DIR);
}
