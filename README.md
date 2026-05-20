# Web SHA-256 Benchmark

Browser benchmark for hashing large user-supplied files. Compares two SHA-256 implementations head-to-head:

- **asmjs** — custom asm.js implementation in [`sha256/asmjs/`](sha256/asmjs/)
- **hash-wasm** — WebAssembly implementation from [Daninet/hash-wasm](https://github.com/Daninet/hash-wasm) in [`sha256/wasm/`](sha256/wasm/)

Both run in dedicated Web Workers with identical streaming logic so timings are comparable.

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`), drop one or more files, and click **Run benchmark**.

## What it measures

For each file and implementation the benchmark records:

- Elapsed time (ms)
- Throughput (MB/s)
- SHA-256 hash (hex)

Hashes from both implementations are compared per file; mismatches are highlighted. A summary shows total bytes processed and average throughput per implementation.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run preview` | Preview production build |

## Project layout

```
sha256/
  asmjs/     # Custom asm.js SHA-256 + worker
  wasm/      # hash-wasm wrapper + worker
  common.ts  # Shared file access helpers
src/
  main.ts       # UI (file drop, results table)
  benchmark.ts  # Benchmark orchestrator
```
