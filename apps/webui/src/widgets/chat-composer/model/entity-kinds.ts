export type EntityKind = 'skill' | 'file';
export type EntityChipProps = {
  kind: EntityKind;
  ref: string;
};
const SKILL_REF_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;
const FILE_REF_PATTERN = /^[^\n\r[\]]{1,256}$/;
export function isValidEntityRef(kind: EntityKind, ref: string): boolean {
  if (typeof ref !== 'string') {
    return false;
  }
  if (kind === 'file') {
    return FILE_REF_PATTERN.test(ref);
  }
  return SKILL_REF_PATTERN.test(ref);
}
