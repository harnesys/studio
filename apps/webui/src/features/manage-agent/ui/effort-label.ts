export function effortLabel(value: string): string {
  if (value === 'xhigh') {
    return 'Extra high';
  }
  if (value.length === 0) {
    return value;
  }
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
