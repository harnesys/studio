export type MoveDrag = {
  workspaceId: string;
  paths: string[];
};
export const MOVE_DRAG_MIME = 'application/harnesys-move';
let drag: MoveDrag | null = null;
export function setMoveDrag(next: MoveDrag | null): void {
  drag = next;
}
export function moveDrag(): MoveDrag | null {
  return drag;
}
export function takeMoveDrag(): MoveDrag | null {
  const current = drag;
  drag = null;
  return current;
}
