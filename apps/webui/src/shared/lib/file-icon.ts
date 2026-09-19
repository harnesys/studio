export type FileIconConfig = {
  icon: string;
  className: string;
};

/** Ported from Jax `shared/utils/file-icon.ts` (mdi via Iconify). */
const EXT_TO_ICON: Record<string, FileIconConfig> = {
  pdf: { icon: 'mdi:file-pdf-box', className: 'text-red-300' },
  md: { icon: 'mdi:language-markdown', className: 'text-purple-400' },
  csv: { icon: 'mdi:file-delimited-outline', className: 'text-green-300' },
  doc: { icon: 'mdi:file-word-outline', className: 'text-blue-300' },
  docx: { icon: 'mdi:file-word-outline', className: 'text-blue-300' },
  xls: { icon: 'mdi:file-excel-outline', className: 'text-green-300' },
  xlsx: { icon: 'mdi:file-excel-outline', className: 'text-green-300' },
  html: { icon: 'mdi:language-html5', className: 'text-orange-400' },
  htm: { icon: 'mdi:language-html5', className: 'text-orange-400' },
  css: { icon: 'mdi:language-css3', className: 'text-sky-400' },
  js: { icon: 'mdi:language-javascript', className: 'text-amber-400' },
  jsx: { icon: 'mdi:language-javascript', className: 'text-amber-400' },
  ts: { icon: 'mdi:language-typescript', className: 'text-blue-400' },
  tsx: { icon: 'mdi:language-typescript', className: 'text-blue-400' },
  json: { icon: 'mdi:code-json', className: 'text-amber-400' },
  py: { icon: 'mdi:language-python', className: 'text-blue-400' },
  go: { icon: 'mdi:language-go', className: 'text-cyan-400' },
  rs: { icon: 'mdi:language-rust', className: 'text-orange-400' },
  java: { icon: 'mdi:language-java', className: 'text-orange-400' },
  rb: { icon: 'mdi:language-ruby', className: 'text-red-400' },
  c: { icon: 'mdi:language-c', className: 'text-blue-400' },
  cpp: { icon: 'mdi:language-cpp', className: 'text-blue-400' },
  sh: { icon: 'mdi:bash', className: 'text-green-400' },
  sql: { icon: 'mdi:database', className: 'text-blue-400' },
  yaml: { icon: 'mdi:file-code-outline', className: 'text-yellow-400' },
  yml: { icon: 'mdi:file-code-outline', className: 'text-yellow-400' },
  toml: { icon: 'mdi:file-code-outline', className: 'text-yellow-400' },
  xml: { icon: 'mdi:code-tags', className: 'text-orange-400' },
  png: { icon: 'mdi:file-image-outline', className: 'text-cyan-300' },
  jpg: { icon: 'mdi:file-image-outline', className: 'text-cyan-300' },
  jpeg: { icon: 'mdi:file-image-outline', className: 'text-cyan-300' },
  gif: { icon: 'mdi:file-image-outline', className: 'text-cyan-300' },
  webp: { icon: 'mdi:file-image-outline', className: 'text-cyan-300' },
  svg: { icon: 'mdi:file-image-outline', className: 'text-cyan-300' },
};

const MIME_TO_ICON: Record<string, FileIconConfig> = {
  'application/pdf': { icon: 'mdi:file-pdf-box', className: 'text-red-300' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    icon: 'mdi:file-word-outline',
    className: 'text-blue-300',
  },
  'text/markdown': { icon: 'mdi:language-markdown', className: 'text-purple-400' },
  'text/plain': { icon: 'mdi:file-text-outline', className: 'text-muted-foreground' },
  'text/csv': { icon: 'mdi:file-delimited-outline', className: 'text-green-300' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    icon: 'mdi:file-excel-outline',
    className: 'text-green-300',
  },
  'text/html': { icon: 'mdi:language-html5', className: 'text-orange-400' },
  'text/css': { icon: 'mdi:language-css3', className: 'text-sky-400' },
  'text/javascript': { icon: 'mdi:language-javascript', className: 'text-amber-400' },
  'application/javascript': { icon: 'mdi:language-javascript', className: 'text-amber-400' },
  'application/x-javascript': { icon: 'mdi:language-javascript', className: 'text-amber-400' },
  'text/jsx': { icon: 'mdi:language-javascript', className: 'text-amber-400' },
  'text/typescript': { icon: 'mdi:language-typescript', className: 'text-blue-400' },
  'application/typescript': { icon: 'mdi:language-typescript', className: 'text-blue-400' },
  'text/tsx': { icon: 'mdi:language-typescript', className: 'text-blue-400' },
  'application/json': { icon: 'mdi:code-json', className: 'text-amber-400' },
  'text/x-python': { icon: 'mdi:language-python', className: 'text-blue-400' },
  'text/python': { icon: 'mdi:language-python', className: 'text-blue-400' },
  'text/x-go': { icon: 'mdi:language-go', className: 'text-cyan-400' },
  'text/x-rust': { icon: 'mdi:language-rust', className: 'text-orange-400' },
  'text/rust': { icon: 'mdi:language-rust', className: 'text-orange-400' },
  'text/x-java': { icon: 'mdi:language-java', className: 'text-orange-400' },
  'text/java': { icon: 'mdi:language-java', className: 'text-orange-400' },
  'text/x-ruby': { icon: 'mdi:language-ruby', className: 'text-red-400' },
  'text/ruby': { icon: 'mdi:language-ruby', className: 'text-red-400' },
  'text/x-csrc': { icon: 'mdi:language-c', className: 'text-blue-400' },
  'text/x-c++src': { icon: 'mdi:language-cpp', className: 'text-blue-400' },
  'text/x-sh': { icon: 'mdi:bash', className: 'text-green-400' },
  'application/x-sh': { icon: 'mdi:bash', className: 'text-green-400' },
  'text/x-sql': { icon: 'mdi:database', className: 'text-blue-400' },
  'text/x-yaml': { icon: 'mdi:file-code-outline', className: 'text-yellow-400' },
  'text/x-toml': { icon: 'mdi:file-code-outline', className: 'text-yellow-400' },
  'text/xml': { icon: 'mdi:code-tags', className: 'text-orange-400' },
  'application/xml': { icon: 'mdi:code-tags', className: 'text-orange-400' },
};

export function getFileIcon(fileName: string, mimeType?: string | null): FileIconConfig {
  const base = fileName.replaceAll('\\', '/').split('/').pop() ?? fileName;
  const ext = base.includes('.') ? (base.split('.').pop()?.toLowerCase() ?? '') : '';

  if (mimeType) {
    if (mimeType.startsWith('image/')) {
      return { icon: 'mdi:file-image-outline', className: 'text-cyan-300' };
    }
    const mimeMatch = MIME_TO_ICON[mimeType];
    if (mimeMatch) {
      return mimeMatch;
    }
  }

  if (ext) {
    const extMatch = EXT_TO_ICON[ext];
    if (extMatch) {
      return extMatch;
    }
  }

  return { icon: 'mdi:file-outline', className: 'text-muted-foreground' };
}
