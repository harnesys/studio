/**
 * Параллельный пул батча тулов с дозреванием перед прерыванием.
 *
 * Когда вызов бросает AskUserInterrupt (permission/approve gate), пул
 * перестает брать новые вызовы, но дает доделаться уже запущенным: их
 * результаты дописываются в чекпоинт батча и на resume восстанавливаются
 * по id вместо переисполнения. Парк без дозревания «сиротит» незавершенный
 * вызов: эффект уже на диске, результата нет в чекпоинте, и повторное
 * исполнение отвечает неправдой — «old_string not found» по примененной
 * правке или created: false у файла, созданного этим же вызовом.
 */
export async function runBatchWorkerPool(input: {
  indexes: number[];
  width: number;
  run: (idx: number) => Promise<void>;
}): Promise<void> {
  const { indexes, width, run } = input;
  if (indexes.length === 0) {
    return;
  }
  if (width <= 1) {
    for (const idx of indexes) {
      await run(idx);
    }
    return;
  }
  let cursor = 0;
  let failure: { error: unknown } | undefined;
  const worker = async (): Promise<void> => {
    while (cursor < indexes.length) {
      if (failure) {
        return;
      }
      const idx = indexes[cursor] as number;
      cursor += 1;
      try {
        await run(idx);
      } catch (error) {
        failure ??= { error };
        return;
      }
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(width, indexes.length); i += 1) {
    workers.push(worker());
  }
  // Воркеры гасят ошибки сами, Promise.all отвергнуться не может.
  await Promise.all(workers);
  const first = failure?.error;
  if (first !== undefined) {
    throw first;
  }
}
