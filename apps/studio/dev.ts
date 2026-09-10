const cwd = import.meta.dir;

const ui = Bun.spawn({
  cmd: ['bunx', 'vite', '--config', 'client/vite.config.ts'],
  cwd,
  stdout: 'inherit',
  stderr: 'inherit',
});

const server = Bun.spawn({
  cmd: ['bun', '--watch', 'server/src/index.ts'],
  cwd,
  stdout: 'inherit',
  stderr: 'inherit',
});

const stop = () => {
  ui.kill();
  server.kill();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await Promise.all([ui.exited, server.exited]);
