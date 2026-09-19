import { ACTIVE_THREAD_STORAGE_PREFIX } from '@/shared/config/constants';
export function getActiveThreadId(agentId: string): string | null {
  try {
    return localStorage.getItem(`${ACTIVE_THREAD_STORAGE_PREFIX}${agentId}`);
  } catch {
    return null;
  }
}
export function setActiveThreadId(agentId: string, threadId: string): void {
  try {
    localStorage.setItem(`${ACTIVE_THREAD_STORAGE_PREFIX}${agentId}`, threadId);
  } catch {}
}
export function clearActiveThreadId(agentId: string): void {
  try {
    localStorage.removeItem(`${ACTIVE_THREAD_STORAGE_PREFIX}${agentId}`);
  } catch {}
}
