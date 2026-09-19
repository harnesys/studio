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
  let failure:
    | {
        error: unknown;
      }
    | undefined;
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
  await Promise.all(workers);
  const first = failure?.error;
  if (first !== undefined) {
    throw first;
  }
}
