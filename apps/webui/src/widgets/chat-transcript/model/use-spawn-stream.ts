import { useEffect } from 'react';
import { connectRunStream } from '@/features/send-message';
export function useSpawnStream(threadId: string, spawnId: string, running: boolean): void {
  useEffect(() => {
    if (!running || !threadId || !spawnId) {
      return;
    }
    connectRunStream(threadId, spawnId);
  }, [running, threadId, spawnId]);
}
