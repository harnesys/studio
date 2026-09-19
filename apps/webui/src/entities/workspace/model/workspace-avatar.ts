const WORKSPACE_AVATAR_CLASSES = [
  'bg-lime-800',
  'bg-blue-700',
  'bg-violet-600',
  'bg-amber-700',
  'bg-cyan-700',
  'bg-rose-700',
] as const;
export function workspaceInitial(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'W';
  }
  return trimmed.slice(0, 1).toUpperCase();
}
export function workspaceAvatarClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const index = hash % WORKSPACE_AVATAR_CLASSES.length;
  return WORKSPACE_AVATAR_CLASSES[index] ?? WORKSPACE_AVATAR_CLASSES[0];
}
