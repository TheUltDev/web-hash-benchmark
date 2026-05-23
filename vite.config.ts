import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const awasmNobleDir = path.resolve(rootDir, 'node_modules/@awasm/noble');

const coopHeader = {'Cross-Origin-Opener-Policy': 'same-origin'};

// credentialless still enables crossOriginIsolated in Chromium, but is much
// less strict than require-corp — required for Vite dev (HMR, workers, previews).
const devCoepHeader = {'Cross-Origin-Embedder-Policy': 'credentialless'};

// Stricter policy for preview / production-like runs.
const previewCoepHeader = {'Cross-Origin-Embedder-Policy': 'require-corp'};

/** Mark dev/preview assets as embeddable when COEP is enabled. */
function crossOriginResourcePolicy(): Plugin {
  return {
    name: 'cross-origin-resource-policy',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/web-hash-benchmark/',
  root: '.',
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
  resolve: {
    alias: [
      {
        find: /^@awasm\/noble\/(.+)$/,
        replacement: `${awasmNobleDir}/$1`,
      },
      {
        find: 'node:worker_threads',
        replacement: path.resolve(rootDir, 'lib/node-worker-threads-stub.ts'),
      },
    ],
  },
  plugins: [crossOriginResourcePolicy()],
  server: {
    headers: {...coopHeader, ...devCoepHeader},
  },
  preview: {
    headers: {...coopHeader, ...previewCoepHeader},
  },
});
