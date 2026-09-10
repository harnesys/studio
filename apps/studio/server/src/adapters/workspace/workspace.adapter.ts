import { mkdir, stat } from 'node:fs/promises';
import type { WorkspaceStatus } from '@harnesys/studio-shared';
import type { WorkspacePort } from '../../domain/workspace.port.ts';

export class WorkspaceAdapter implements WorkspacePort {
  inspect(path: string): Promise<WorkspaceStatus> {
    return inspectPath(path);
  }

  ensureDir(path: string): Promise<void> {
    return mkdir(path, { recursive: true }).then(() => undefined);
  }

  pick(): Promise<string | undefined> {
    return pickDirectory();
  }

  reveal(path: string): Promise<void> {
    return revealPath(path);
  }
}

async function inspectPath(path: string): Promise<WorkspaceStatus> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return { exists: false, kind: 'folder' };
    }
  } catch {
    return { exists: false, kind: 'folder' };
  }

  const inside = await git(path, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') {
    return { exists: true, kind: 'folder' };
  }

  const branch = (await git(path, ['branch', '--show-current'])) || 'HEAD';
  const porcelain = await git(path, ['status', '--porcelain']);
  return {
    exists: true,
    kind: 'git',
    branch,
    dirty: porcelain.length > 0,
  };
}

async function pickDirectory(): Promise<string | undefined> {
  let picked: string | undefined;
  if (process.platform === 'darwin') {
    picked = await pickMac();
  } else if (process.platform === 'win32') {
    picked = await pickWindows();
  } else {
    picked = await pickLinux();
  }
  if (!picked) {
    return undefined;
  }
  return picked.replace(/[/\\]+$/, '');
}

function pickMac(): Promise<string | undefined> {
  const script = [
    'try',
    '  POSIX path of (choose folder with prompt "Choose a workspace")',
    'on error number -128',
    '  return ""',
    'end try',
  ].join('\n');
  return run(['osascript', '-e', script]);
}

function pickWindows(): Promise<string | undefined> {
  return run([
    'powershell',
    '-NoProfile',
    '-STA',
    '-Command',
    "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose a workspace'; $d.ShowNewFolderButton = $true; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }",
  ]);
}

async function pickLinux(): Promise<string | undefined> {
  return (
    (await run(['zenity', '--file-selection', '--directory', '--title=Choose a workspace'])) ??
    run(['kdialog', '--getexistingdirectory', process.env.HOME ?? '/'])
  );
}

async function run(cmd: string[]): Promise<string | undefined> {
  try {
    const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
    const text = (await new Response(proc.stdout).text()).trim();
    const code = await proc.exited;
    if (code !== 0 || text === '') {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
}

async function revealPath(path: string): Promise<void> {
  let opener = 'xdg-open';
  if (process.platform === 'darwin') {
    opener = 'open';
  } else if (process.platform === 'win32') {
    opener = 'explorer';
  }
  const proc = Bun.spawn([opener, path], { stdout: 'ignore', stderr: 'ignore' });
  await proc.exited;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(['git', '-C', cwd, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    return '';
  }
  return text.trim();
}
