import type { Stats } from 'node:fs';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PluginLoadDiagnostic, PluginSkillRef } from '../../domain/plugin.ts';
import { parseSkillFile } from '../skills/parse-skill-file.ts';

export type DiscoverPluginSkillsResult = {
  skills: PluginSkillRef[];
  diagnostics: PluginLoadDiagnostic[];
};

function tryStat(target: string): Stats | undefined {
  try {
    return statSync(target);
  } catch {
    return undefined;
  }
}

export function discoverPluginSkills(
  pluginRoot: string,
  pluginName: string,
): DiscoverPluginSkillsResult {
  const skillsRoot = path.resolve(pluginRoot, 'skills');
  const skills: PluginSkillRef[] = [];
  const diagnostics: PluginLoadDiagnostic[] = [];

  if (!existsSync(skillsRoot)) {
    return { skills, diagnostics };
  }

  const skillsStat = tryStat(skillsRoot);
  if (skillsStat === undefined) {
    diagnostics.push({
      level: 'error',
      code: 'skills_not_directory',
      message: `cannot stat skills path: ${skillsRoot}`,
      path: skillsRoot,
    });
    return { skills, diagnostics };
  }

  if (!skillsStat.isDirectory()) {
    diagnostics.push({
      level: 'error',
      code: 'skills_not_directory',
      message: 'skills exists but is not a directory',
      path: skillsRoot,
    });
    return { skills, diagnostics };
  }

  let names: string[];
  try {
    names = readdirSync(skillsRoot);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diagnostics.push({
      level: 'error',
      code: 'skills_not_directory',
      message,
      path: skillsRoot,
    });
    return { skills, diagnostics };
  }

  for (const name of names) {
    const dir = path.join(skillsRoot, name);
    const dirStat = tryStat(dir);
    if (dirStat === undefined || !dirStat.isDirectory()) {
      continue;
    }

    const skillFile = path.join(dir, 'SKILL.md');
    const skillStat = tryStat(skillFile);
    if (skillStat === undefined || !skillStat.isFile()) {
      continue;
    }

    let content: string;
    try {
      content = readFileSync(skillFile, 'utf8');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      diagnostics.push({
        level: 'warning',
        code: 'invalid_skill',
        message,
        path: skillFile,
      });
      continue;
    }

    try {
      const doc = parseSkillFile(content, skillFile);
      skills.push({
        id: `${pluginName}:${doc.name}`,
        name: doc.name,
        dir,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      diagnostics.push({
        level: 'warning',
        code: 'invalid_skill',
        message,
        path: skillFile,
      });
    }
  }

  return { skills, diagnostics };
}
