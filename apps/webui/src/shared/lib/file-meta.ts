export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtLabel(name: string, mediaType = ''): string {
  const base = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot > 0) {
    return base.slice(dot + 1).toUpperCase();
  }
  if (mediaType.startsWith('image/')) {
    return 'Image';
  }
  if (mediaType.startsWith('audio/')) {
    return 'Audio';
  }
  if (mediaType.startsWith('video/')) {
    return 'Video';
  }
  return 'File';
}
