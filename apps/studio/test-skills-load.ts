import { FsSkillRegistry } from 'harnesys/adapters/node';

const registry = new FsSkillRegistry({
  roots: ['/Users/mikestotik/.harnesys/skills'],
});

const skills = registry.list();
console.log('Loaded skills:', skills.map(s => s.name));
console.log('Count:', skills.length);
