import { createInterface } from 'node:readline/promises';
import { commandUp, staticDirAvailable, type UpOptions } from './lifecycle.ts';
import { HOST_DEFAULT_PORT, resolveStaticDir, WEB_DEFAULT_PORT } from './paths.ts';
import { installSystemdUnits } from './systemd.ts';

async function ask(question: string, fallbackYes: boolean): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = fallbackYes ? '[Y/n]' : '[y/N]';
    for (;;) {
      const answer = (await rl.question(`${question} ${suffix} `)).trim().toLowerCase();
      if (answer === '') {
        return fallbackYes;
      }
      if (answer === 'y' || answer === 'yes') {
        return true;
      }
      if (answer === 'n' || answer === 'no') {
        return false;
      }
    }
  } finally {
    rl.close();
  }
}
export async function runMenu(): Promise<void> {
  console.log('harnesys setup');
  const wantServer = await ask('Start Server (harnesys-host)?', true);
  let wantWebUi = wantServer ? await ask('Start WebUI (harnesys-web)?', true) : false;
  let hostOnly = false;
  if (wantWebUi && !staticDirAvailable(resolveStaticDir())) {
    const dir = resolveStaticDir();
    console.log(
      `WebUI static assets not found at ${dir} — the WebUI needs a repo checkout (\`bun run build:client\`) or the Docker compose stack (\`deploy/\`).`,
    );
    hostOnly = await ask('Start the Server without the WebUI?', false);
    if (!hostOnly) {
      console.log('aborted');
      return;
    }
    wantWebUi = false;
  }
  const wantSystemd =
    process.platform === 'linux' && wantServer
      ? await ask('Register systemd user units (start on login)?', false)
      : false;
  if (!wantServer) {
    console.log('nothing selected');
    return;
  }
  const options: UpOptions & {
    installSystemd: boolean;
  } = {
    hostPort: HOST_DEFAULT_PORT,
    webPort: WEB_DEFAULT_PORT,
    withUi: wantWebUi,
    installSystemd: wantSystemd,
  };
  if (wantSystemd) {
    await commandUp(options, () => installSystemdUnits({ ...options, includeWeb: !hostOnly }));
    return;
  }
  await commandUp(options, async () => {});
}
