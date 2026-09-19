import path from 'node:path';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { DEFAULT_API_PORT, DEFAULT_DEV_SERVER_PORT } from './src/shared/config/constants.ts';

const root = import.meta.dirname;
const serverEnvDir = path.resolve(root, '..', 'server');
const BENIGN_PROXY_CODES = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED']);
function quietWsProxyDisconnects(): Plugin {
  return {
    name: 'quiet-ws-proxy-disconnects',
    configureServer(server) {
      const logger = server.config.logger;
      const original = logger.error.bind(logger);
      logger.error = (msg, options) => {
        const text = typeof msg === 'string' ? msg : String(msg);
        const code =
          options?.error &&
          typeof options.error === 'object' &&
          'code' in options.error &&
          typeof (
            options.error as {
              code?: unknown;
            }
          ).code === 'string'
            ? (
                options.error as {
                  code: string;
                }
              ).code
            : '';
        if (
          BENIGN_PROXY_CODES.has(code) &&
          (text.includes('ws proxy error') || text.includes('ws proxy socket error'))
        ) {
          return;
        }
        original(msg, options);
      };
    },
  };
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, serverEnvDir, '');
  const apiPort = readPort(env.PORT, DEFAULT_API_PORT);
  const uiPort = readPort(env.VITE_DEV_SERVER_PORT, DEFAULT_DEV_SERVER_PORT);
  return {
    root,
    envDir: serverEnvDir,
    envPrefix: ['VITE_', 'CLIENT_'],
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      quietWsProxyDisconnects(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(root, './src'),
        '@harnesys/studio-shared': path.resolve(root, '../../packages/studio-shared/types.ts'),
        'harnesys/domain': path.resolve(root, '../../packages/harnesys/domain.ts'),
        harnesys: path.resolve(root, '../../packages/harnesys/index.ts'),
      },
    },
    server: {
      port: uiPort,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          timeout: 0,
          proxyTimeout: 0,
          ws: true,
          configure(proxy) {
            proxy.on('proxyRes', (proxyRes, _req, res) => {
              const type = header(proxyRes.headers['content-type']);
              if (!type.includes('text/event-stream')) {
                return;
              }
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache, no-transform');
              res.setHeader('X-Accel-Buffering', 'no');
              res.flushHeaders?.();
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
function readPort(raw: string | undefined, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function header(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}
