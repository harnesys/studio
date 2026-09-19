import { commandDown, commandLogs, commandRestart, commandStatus, commandUp } from './lifecycle.ts';
import { runMenu } from './menu.ts';
import { commandPair } from './pair.ts';
import { HOST_DEFAULT_PORT, WEB_DEFAULT_PORT } from './paths.ts';
import { installSystemdUnits } from './systemd.ts';
import { commandUpdate } from './update.ts';

const USAGE = `harnesys — supervisor for the harnesys host and web UI

usage:
  harnesys up [--with-ui] [--port N] [--web-port N] [--install-systemd]
  harnesys down
  harnesys status
  harnesys restart [server|webui|all] [--port N] [--web-port N]
  harnesys logs [-f] [server|webui]
  harnesys update [--repo owner/name]
  harnesys host pair [--port N]
  harnesys help

bare \`harnesys\` on a terminal opens an interactive menu;
with piped stdio or explicit flags everything runs non-interactive.

state: pidfiles ~/.harnesys/run/<name>.pid, logs ~/.harnesys/logs/<name>.log
(HARNESYS_HOME respected)`;

type ParsedArgs = {
  positionals: string[];
  flags: Map<string, string | boolean>;
};

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        flags.set(token.slice(2, eq), token.slice(eq + 1));
        continue;
      }
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags.set(token.slice(2), next);
        index += 1;
      } else {
        flags.set(token.slice(2), true);
      }
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      flags.set(token.slice(1), true);
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags };
}

function flagNumber(flags: Map<string, string | boolean>, name: string): number | undefined {
  const raw = flags.get(name);
  if (raw === undefined || raw === true) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`harnesys: --${name} expects a positive number, got "${raw}"`);
    process.exit(1);
  }
  return value;
}

function fail(message: string): never {
  console.error(`harnesys: ${message}`);
  console.error(`try \`harnesys help\``);
  process.exit(1);
}

async function main(): Promise<void> {
  const [command, ...rest] = Bun.argv.slice(2);
  switch (command ?? '') {
    case '':
      if (process.stdin.isTTY) {
        await runMenu().catch(() => {
          console.log('\naborted');
        });
      } else {
        console.log(USAGE);
      }
      return;
    case 'up': {
      const parsed = parseArgs(rest);
      const hostPort = flagNumber(parsed.flags, 'port') ?? HOST_DEFAULT_PORT;
      const webPort = flagNumber(parsed.flags, 'web-port') ?? WEB_DEFAULT_PORT;
      const withUi = parsed.flags.get('with-ui') === true || parsed.flags.has('web-port');
      const installSystemd = parsed.flags.get('install-systemd') === true;
      await commandUp({ hostPort, webPort, withUi, installSystemd }, () =>
        installSystemdUnits({ hostPort, webPort }),
      );
      return;
    }
    case 'down':
      await commandDown();
      return;
    case 'status':
      await commandStatus();
      return;
    case 'restart': {
      const parsed = parseArgs(rest);
      await commandRestart(parsed.positionals[0], {
        port: flagNumber(parsed.flags, 'port'),
        webPort: flagNumber(parsed.flags, 'web-port'),
      });
      return;
    }
    case 'logs': {
      const parsed = parseArgs(rest);
      await commandLogs(parsed.flags.has('f'), parsed.positionals[0]);
      return;
    }
    case 'update': {
      const parsed = parseArgs(rest);
      const repo = parsed.flags.get('repo');
      await commandUpdate(typeof repo === 'string' ? repo : parsed.positionals[0]);
      return;
    }
    case 'host': {
      const [subcommand, ...pairRest] = rest;
      if (subcommand !== 'pair') {
        fail(`unknown host subcommand "${subcommand ?? ''}" — expected: pair`);
      }
      await commandPair(flagNumber(parseArgs(pairRest).flags, 'port'));
      return;
    }
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      return;
    default:
      fail(`unknown command "${command}"`);
  }
}

await main();
