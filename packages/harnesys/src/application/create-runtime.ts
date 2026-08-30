// biome-ignore-all lint/suspicious/useAwait: skeleton throws without await per Task 5 spec
import { NotImplementedError } from '../domain/errors.ts';
import type { CreateRuntimeOptions, RuntimeHandle } from '../ports/create-runtime.ts';

export async function createRuntime(options: CreateRuntimeOptions): Promise<RuntimeHandle> {
  const wiring = options;
  void wiring;

  return {
    run: async () => {
      throw new NotImplementedError('run');
    },
    start: () => {
      throw new NotImplementedError('start');
    },
    resume: async () => {
      throw new NotImplementedError('resume');
    },
    compile: () => {
      throw new NotImplementedError('compile');
    },
    check: () => {
      throw new NotImplementedError('check');
    },
    session: () => {
      throw new NotImplementedError('session');
    },
    reloadSkills: () => {
      throw new NotImplementedError('reloadSkills');
    },
    reloadMcp: () => {
      throw new NotImplementedError('reloadMcp');
    },
    close: () => {
      throw new NotImplementedError('close');
    },
  };
}
