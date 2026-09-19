export type OpenFileKind = 'text' | 'image' | 'pdf' | 'unsupported';
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const PDF_EXTS = new Set(['pdf']);
const MARKDOWN_EXTS = new Set(['md', 'mdx', 'markdown']);
const TEXT_EXTS = new Set([
  'txt',
  'md',
  'mdx',
  'markdown',
  'json',
  'jsonc',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'sh',
  'bash',
  'zsh',
  'py',
  'rs',
  'go',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'sql',
  'graphql',
  'vue',
  'svelte',
  'astro',
  'php',
  'rb',
  'lua',
  'r',
  'dockerfile',
  'gitignore',
  'editorconfig',
  'log',
  'csv',
  'tsv',
]);
export function fileBasename(path: string): string {
  return path.replaceAll('\\', '/').split('/').pop() ?? path;
}
export function fileExtension(path: string): string {
  const base = fileBasename(path);
  if (base.startsWith('.') && !base.slice(1).includes('.')) {
    return base.slice(1).toLowerCase();
  }
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot + 1).toLowerCase();
}
export function openFileKind(path: string): OpenFileKind {
  const ext = fileExtension(path);
  if (IMAGE_EXTS.has(ext)) {
    return 'image';
  }
  if (PDF_EXTS.has(ext)) {
    return 'pdf';
  }
  if (!ext || TEXT_EXTS.has(ext)) {
    return 'text';
  }
  return 'unsupported';
}
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTS.has(fileExtension(path));
}
