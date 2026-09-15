export type EntityKind = 'skill';
export type EntityChipProps = { kind: EntityKind; ref: string };
const REF_PATTERN = /^[A-Za-z0-9:_-]{1,120}$/;
export function isValidEntityRef(_kind: EntityKind, ref: string): boolean {
  return REF_PATTERN.test(ref);
}
