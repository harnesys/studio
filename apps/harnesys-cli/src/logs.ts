import { componentLabel, parseTargetOrUndefined } from './components.ts';
import { harnesysHome, logFilePath } from './paths.ts';
import { followFile, tailLines } from './processes.ts';

const LOG_TAIL_LINES = 40;

function fail(message: string): never {
  console.error(`harnesys: ${message}`);
  process.exit(1);
}

export async function commandLogs(follow: boolean, target: string | undefined): Promise<void> {
  const home = harnesysHome();
  const names = parseTargetOrUndefined(target);
  if (!names) {
    fail(`unknown target "${target}" — expected server | webui | all`);
  }
  if (!follow) {
    for (const name of names) {
      console.log(`==> ${componentLabel(name)}: ${logFilePath(home, name)} <==`);
      const lines = tailLines(home, name, LOG_TAIL_LINES);
      if (lines.length === 0) {
        console.log('  (empty)');
      }
      for (const line of lines) {
        console.log(line);
      }
    }
    return;
  }
  console.log('following logs — Ctrl+C to stop');
  for (const name of names) {
    followFile(logFilePath(home, name), (chunk) => {
      for (const line of chunk.split('\n')) {
        if (line !== '') {
          process.stdout.write(`[${name}] ${line}\n`);
        }
      }
    });
  }
  await new Promise<never>(() => {
    // follow until interrupted; pending timers keep the process alive
  });
}
