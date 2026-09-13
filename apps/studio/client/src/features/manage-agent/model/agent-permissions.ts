/**
 * Operation rows shown on the Permissions tab. Delegates get these four only
 * (spawn cannot recurse); top-level agents add `agents`. `fs.read` is always
 * allow and never configured here.
 */
export const PERM_OPS = ['fs.write', 'process', 'network', 'mcp'] as const;
