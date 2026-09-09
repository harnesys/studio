import { FsSkillRegistry } from 'harnesys/adapters/node';
import { skillRegistryRoots } from '/Users/mikestotik/Projects/Harnesys/apps/studio/server/adapters/store/studio-layout.ts';
import { systemSkillsPath } from '/Users/mikestotik/Projects/Harnesys/apps/studio/server/adapters/store/studio-layout.ts';

console.log('System skills path:', systemSkillsPath());
console.log('System skills exists:', require('fs').existsSync(systemSkillsPath()));

const registry = new FsSkillRegistry({
  roots: [systemSkillsPath()],
});

const skills = registry.list();
console.log('System skills loaded:', skills.map(s => s.name));
console.log('Total:', skills.length);
