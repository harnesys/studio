export type IdeDrag = { tabId: string; fromGroupId: string; workspaceId: string };

let drag: IdeDrag | null = null;

export function setIdeDrag(next: IdeDrag | null) {
  drag = next;
}

export function ideDrag(): IdeDrag | null {
  return drag;
}

export function takeIdeDrag(): IdeDrag | null {
  const current = drag;
  drag = null;
  return current;
}
