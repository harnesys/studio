import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ATTACHMENTS_DIR,
  bundledAssetsRoot,
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
export function systemSkillsPath(home: string = defaultHomePath()): string {
  return join(home, SKILLS_DIR);
}
export function bundledSkillsPath(): string {
  return join(bundledAssetsRoot(), SKILLS_DIR);
}
export function bundledAssetsPath(): string {
  return bundledAssetsRoot();
}
export function bundledPresetsPath(sub: 'agents' | 'modes'): string {
  return join(bundledAssetsRoot(), 'presets', sub);
}
export function systemPresetsPath(
  sub: 'agents' | 'modes',
  home: string = defaultHomePath(),
): string {
  return join(home, 'presets', sub);
}
export function studioDir(workspacePath: string): string {
  const next = join(workspacePath, STUDIO_DIR);
  const legacy = join(workspacePath, STUDIO_DIR_LEGACY);
  if (existsSync(legacy) && !existsSync(next)) {
    renameSync(legacy, next);
  }
  return next;
}
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
export function skillRegistryRoots(workspacePath: string): string[] {
  return [bundledSkillsPath(), workspaceSkillsPath(workspacePath)];
}
export function workspaceDbPath(workspacePath: string): string {
  return join(studioDir(workspacePath), WORKSPACE_DB_FILE);
}
export function studioDbPath(home: string = defaultHomePath()): string {
  return join(home, DB_FILE);
}
export function studioDbBakPath(home: string = defaultHomePath()): string {
  return join(home, DB_BAK_FILE);
}
export function workspacePluginsPath(workspacePath: string): string {
  return join(studioDir(workspacePath), PLUGINS_DIR);
}
export function workspacePluginInstallPath(workspacePath: string, name: string): string {
  return join(workspacePluginsPath(workspacePath), name);
}
export function workspacePluginDataPath(workspacePath: string, name: string): string {
  return join(studioDir(workspacePath), PLUGINS_DATA_DIR, name);
}
export function workspacePresetsPath(workspacePath: string, sub: 'agents' | 'modes'): string {
  return join(studioDir(workspacePath), 'presets', sub);
}
export function attachmentsDir(workspacePath: string, threadId: string): string {
  return join(studioDir(workspacePath), 'threads', threadId, ATTACHMENTS_DIR);
}
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
