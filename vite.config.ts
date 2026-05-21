import {defineConfig} from 'vite';

export default defineConfig({
  base: '/web-hash-benchmark/',
  root: '.',
  build: {
    target: 'esnext',
  },
});
