import {defineConfig} from 'vite';

export default defineConfig({
  base: '/web-sha256-benchmark/',
  root: '.',
  build: {
    target: 'esnext',
  },
});
