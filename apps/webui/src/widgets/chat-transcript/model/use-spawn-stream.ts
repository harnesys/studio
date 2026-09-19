import { useEffect } from 'react';
import { connectRunStream } from '@/features/send-message';

/**
 * Подписка на стрим дочернего запуска, пока спавн running. Клиент в реестре
 * один на (threadId, runId) — карточка и спавн-вью делят его, подключение
 * идемпотентно. Явного отключения нет: терминальное событие удаляет клиента
 * из реестра, а stop() оборвал бы поток, общий для всех подписчиков.
 */
export function useSpawnStream(threadId: string, spawnId: string, running: boolean): void {
  useEffect(() => {
    if (!running || !threadId || !spawnId) {
      return;
    }
    connectRunStream(threadId, spawnId);
  }, [running, threadId, spawnId]);
}
