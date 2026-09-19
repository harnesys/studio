import type { WindowDesk } from '@harnesys/studio-shared';
import { apiJson } from './client';
export function getWindowDesk() {
  return apiJson<WindowDesk>('/api/window/desk');
}
export function putWindowDesk(desk: WindowDesk) {
  return apiJson<WindowDesk>('/api/window/desk', {
    method: 'PUT',
    body: JSON.stringify(desk),
  });
}
