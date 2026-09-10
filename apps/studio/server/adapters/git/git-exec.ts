import { GIT_TIMEOUT_MS } from '../../config/constants.ts';
import { GitNotFoundError, GitTimeoutError } from '../../domain/git.error.ts';

export async function execGit(
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  try {
    proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  } catch (err) {
    const msg = String(err);
    if (/ENOENT|not found/i.test(msg)) {
      throw new GitNotFoundError('git not found');
    }
    throw err;
  }

  const timeout = setTimeout(() => {
    try {
      proc?.kill();
    } catch {
      // ignore
    }
  }, GIT_TIMEOUT_MS);

  try {
    const stdoutStream =
      proc.stdout != null && typeof proc.stdout !== 'number'
        ? (proc.stdout as ReadableStream)
        : null;
    const stderrStream =
      proc.stderr != null && typeof proc.stderr !== 'number'
        ? (proc.stderr as ReadableStream)
        : null;
    const [stdout, stderr, code] = await Promise.all([
      stdoutStream ? new Response(stdoutStream).text() : '',
      stderrStream ? new Response(stderrStream).text() : '',
      proc.exited,
    ]);
    return { code, stdout, stderr };
  } catch (err) {
    const msg = String(err);
    if (/kill|timeout/i.test(msg)) {
      throw new GitTimeoutError('git timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function execGitTrim(cwd: string, args: string[]): Promise<string> {
  const res = await execGit(cwd, args);
  if (res.code !== 0) {
    if (/not found|No such file|ENOENT/i.test(res.stderr)) {
      throw new GitNotFoundError(res.stderr);
    }
    return '';
  }
  return res.stdout.trim();
}
