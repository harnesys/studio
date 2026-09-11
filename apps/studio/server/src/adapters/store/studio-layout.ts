import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ATTACHMENTS_DIR,
  HOME_DIR_NAME,
  PLUGINS_DATA_DIR,
  PLUGINS_DIR,
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
  PLUGINS_DATA_DIR,
  PLUGINS_DIR,
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
 * Skills and agent presets shipped with the app (repo: `apps/studio/assets/skills`).
 * Lowest-precedence root: home overrides it, workspace overrides home.
 * `HARNESYS_BUNDLED_SKILLS` points elsewhere for packaged builds;
 * a missing directory simply contributes nothing.
 */
export function bundledSkillsPath(): string {
  return env.bundledSkills ?? join(import.meta.dir, '..', '..', '..', '..', 'assets', SKILLS_DIR);
}

/** Plan-mode contract text prepended when run mode is `plan` (`apps/studio/assets/plan-mode.md`). */
export function planModePromptPath(): string {
  return join(import.meta.dir, '..', '..', '..', '..', 'assets', 'plan-mode.md');
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
 * Skill registry roots, ascending precedence: bundled app assets, host home,
 * workspace. Same name in a later root overrides earlier ones (`Map.set` last
 * wins), so workspace overrides home and home overrides the bundle.
 */
export function skillRegistryRoots(workspacePath: string): string[] {
  const systemRoot = systemSkillsPath();
  mkdirSync(systemRoot, { recursive: true });
  return [bundledSkillsPath(), systemRoot, workspaceSkillsPath(workspacePath)];
}

export function defaultWorkspacePath(home: string, name: string): string {
  const slug = name.replace(/[/\\]/g, '-').replace(/^\.+/, '').trim() || 'workspace';
  return join(home, WORKSPACES_DIR, slug);
}

export function attachmentsDir(workspacePath: string, threadId: string): string {
  return join(studioDir(workspacePath), 'threads', threadId, ATTACHMENTS_DIR);
}

/** Host-wide plugin checkouts (`~/.harnesys/plugins`). */
export function pluginsPath(home: string = defaultHomePath()): string {
  return join(home, PLUGINS_DIR);
}

export function pluginInstallPath(home: string, name: string): string {
  return join(home, PLUGINS_DIR, name);
}

export function pluginDataPath(home: string, name: string): string {
  return join(home, PLUGINS_DATA_DIR, name);
}
