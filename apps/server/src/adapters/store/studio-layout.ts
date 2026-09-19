import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ATTACHMENTS_DIR,
  CONFIG_FILE,
  DB_BAK_FILE,
  DB_FILE,
  HOME_DIR_NAME,
  MARKETPLACES_DIR,
  PLUGINS_DATA_DIR,
  PLUGINS_DIR,
  SKILLS_DIR,
  STUDIO_DIR,
  STUDIO_DIR_LEGACY,
  WORKSPACE_DB_FILE,
} from '../../config/constants.ts';
import { env } from '../../config/env.ts';

export {
  ATTACHMENTS_DIR,
  CONFIG_FILE,
  DB_BAK_FILE,
  DB_FILE,
  HOME_DIR_NAME,
  MARKETPLACES_DIR,
  PLUGINS_DATA_DIR,
  PLUGINS_DIR,
  SKILLS_DIR,
  STUDIO_DIR,
  STUDIO_DIR_LEGACY,
  WORKSPACE_DB_FILE,
  WORKSPACES_DIR,
} from '../../config/constants.ts';

export function defaultHomePath(): string {
  return env.harnesysHome ?? join(homedir(), HOME_DIR_NAME);
}

export function configJsonPath(home: string = defaultHomePath()): string {
  return join(home, CONFIG_FILE);
}

/** Host-wide skills for every workspace (`~/.harnesys/skills`). */
export function systemSkillsPath(home: string = defaultHomePath()): string {
  return join(home, SKILLS_DIR);
}

/**
 * Skills shipped with the app (repo: `apps/server/assets/skills`).
 * Lowest-precedence root: home overrides it, workspace overrides home.
 * `HARNESYS_BUNDLED_SKILLS` points elsewhere for packaged builds;
 * a missing directory simply contributes nothing.
 */
export function bundledSkillsPath(): string {
  return env.bundledSkills ?? join(import.meta.dir, '..', '..', '..', 'assets', SKILLS_DIR);
}

/** Root of the bundled app assets shipped with Studio (`apps/server/assets`). */
export function bundledAssetsPath(): string {
  return join(import.meta.dir, '..', '..', '..', 'assets');
}

/**
 * Bundled agent/mode preset roots under `apps/server/assets/presets`.
 * `HARNESYS_BUNDLED_PRESETS` points elsewhere for packaged builds;
 * a missing directory simply contributes nothing.
 */
export function bundledPresetsPath(sub: 'agents' | 'modes'): string {
  return join(env.bundledPresets ?? join(bundledAssetsPath(), 'presets'), sub);
}

/** User preset root, shadows bundled: `~/.harnesys/presets/<sub>`. */
export function systemPresetsPath(
  sub: 'agents' | 'modes',
  home: string = defaultHomePath(),
): string {
  return join(home, 'presets', sub);
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
 * Skill registry roots, ascending precedence: bundled app assets, then
 * workspace overlay. Host `~/.harnesys/skills` is seed-only (cutover/create),
 * not a live root.
 */
export function skillRegistryRoots(workspacePath: string): string[] {
  return [bundledSkillsPath(), workspaceSkillsPath(workspacePath)];
}

/** Per-node domain sqlite: `<workspace>/.harnesys/workspace.db`. */
export function workspaceDbPath(workspacePath: string): string {
  return join(studioDir(workspacePath), WORKSPACE_DB_FILE);
}

export function studioDbPath(home: string = defaultHomePath()): string {
  return join(home, DB_FILE);
}

export function studioDbBakPath(home: string = defaultHomePath()): string {
  return join(home, DB_BAK_FILE);
}

/** Plugin checkouts for a node: `<workspace>/.harnesys/plugins`. */
export function workspacePluginsPath(workspacePath: string): string {
  return join(studioDir(workspacePath), PLUGINS_DIR);
}

export function workspacePluginInstallPath(workspacePath: string, name: string): string {
  return join(workspacePluginsPath(workspacePath), name);
}

export function workspacePluginDataPath(workspacePath: string, name: string): string {
  return join(studioDir(workspacePath), PLUGINS_DATA_DIR, name);
}

/** User presets under the node meta dir (seed from host on cutover/create). */
export function workspacePresetsPath(workspacePath: string, sub: 'agents' | 'modes'): string {
  return join(studioDir(workspacePath), 'presets', sub);
}

export function attachmentsDir(workspacePath: string, threadId: string): string {
  return join(studioDir(workspacePath), 'threads', threadId, ATTACHMENTS_DIR);
}

/**
 * Host-wide plugin checkouts (`~/.harnesys/plugins`).
 * Phase 4a keeps this path; Phase 4b moves checkouts to `<workspace>/.harnesys/plugins`.
 */
export function pluginsPath(home: string = defaultHomePath()): string {
  return join(home, PLUGINS_DIR);
}

export function pluginInstallPath(home: string, name: string): string {
  return join(home, PLUGINS_DIR, name);
}

export function pluginDataPath(home: string, name: string): string {
  return join(home, PLUGINS_DATA_DIR, name);
}

export function marketplaceInstallPath(home: string, registryId: string): string {
  return join(home, MARKETPLACES_DIR, registryId);
}
