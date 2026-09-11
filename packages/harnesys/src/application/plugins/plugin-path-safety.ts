import path from 'node:path';

export function isInsidePluginRoot(pluginRoot: string, absolutePath: string): boolean {
  const root = path.resolve(pluginRoot);
  const resolved = path.resolve(absolutePath);
  if (resolved === root) {
    return true;
  }
  return resolved.startsWith(root + path.sep);
}

export function resolvePluginPath(pluginRoot: string, relativeFromDotSlash: string): string {
  if (!relativeFromDotSlash.startsWith('./')) {
    throw new Error(`plugin-relative path must start with "./": ${relativeFromDotSlash}`);
  }
  const root = path.resolve(pluginRoot);
  const resolved = path.resolve(root, relativeFromDotSlash);
  if (!isInsidePluginRoot(root, resolved)) {
    throw new Error(`path escapes plugin root: ${relativeFromDotSlash}`);
  }
  return resolved;
}
