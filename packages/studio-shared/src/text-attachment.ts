const TEXT_MEDIA_PREFIXES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
  'application/csv',
  'application/x-sh',
];
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.yaml',
  '.yml',
  '.xml',
  '.csv',
  '.log',
  '.ini',
  '.toml',
  '.cfg',
  '.conf',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.css',
  '.html',
  '.svg',
  '.env',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
]);
export function isTextAttachment(mediaType: string, name: string): boolean {
  if (TEXT_MEDIA_PREFIXES.some((prefix) => mediaType.startsWith(prefix))) {
    return true;
  }
  const dot = name.lastIndexOf('.');
  if (dot >= 0) {
    return TEXT_EXTENSIONS.has(name.slice(dot).toLowerCase());
  }
  return false;
}
