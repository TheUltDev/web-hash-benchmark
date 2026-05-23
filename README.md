# Web Hash Benchmark

Browser benchmark for hashing large user-supplied files. Compares incremental hash algorithms and implementations side by side in dedicated Web Workers with shared streaming logic so timings stay comparable.

## Algorithms and implementations

| Algorithm | Implementation | Source |
|-----------|----------------|--------|
| SHA-256 | hash-wasm | [Daninet/hash-wasm](https://github.com/Daninet/hash-wasm) |
| SHA-256 | hash-wasm (simd) | [@ult/hash-wasm](https://www.npmjs.com/package/@ult/hash-wasm) (when WASM SIMD is available) |
| SHA-256 | asmjs | Custom asm.js in [`hash/sha256/asmjs/`](hash/sha256/asmjs/) |
| SHA-256 | awasm-noble (simd) | [@awasm/noble](https://github.com/paulmillr/awasm-noble) `wasm` backend (when WASM SIMD is available) |
| SHA-256 | awasm-noble (threads) | [@awasm/noble](https://github.com/paulmillr/awasm-noble) `wasm_threads` backend (when cross-origin isolated) |
| SHA-256 | crypto.subtle | Browser Web Crypto API (`crypto.subtle.digest`) |
| BLAKE3 | hash-wasm | [Daninet/hash-wasm](https://github.com/Daninet/hash-wasm) |
| BLAKE3 | hash-wasm (simd) | [@ult/hash-wasm](https://www.npmjs.com/package/@ult/hash-wasm) (when WASM SIMD is available) |
| BLAKE3 | awasm-noble (simd) | [@awasm/noble](https://github.com/paulmillr/awasm-noble) `wasm` backend (when WASM SIMD is available) |
| BLAKE3 | awasm-noble (threads) | [@awasm/noble](https://github.com/paulmillr/awasm-noble) `wasm_threads` backend (when cross-origin isolated) |
| BLAKE2b | hash-wasm | [Daninet/hash-wasm](https://github.com/Daninet/hash-wasm) |
| BLAKE2b | awasm-noble (simd) | [@awasm/noble](https://github.com/paulmillr/awasm-noble) `wasm` backend (when WASM SIMD is available) |
| BLAKE2b | awasm-noble (threads) | [@awasm/noble](https://github.com/paulmillr/awasm-noble) `wasm_threads` backend (when cross-origin isolated) |

The hash-wasm (simd) and awasm-noble (simd) variants are omitted automatically when the browser does not support WebAssembly SIMD. The `awasm-noble (threads)` variants require cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy`). The Vite dev server uses `credentialless` COEP (works with HMR and embedded dev tooling); `npm run preview` uses stricter `require-corp`. Both send `Cross-Origin-Resource-Policy: cross-origin` on served assets. The UI shows badges indicating whether SIMD and WASM threads are available.

The `crypto.subtle` row uses the typical one-shot pattern (`file.arrayBuffer()` then `crypto.subtle.digest`), not incremental streaming. It is omitted when the file exceeds a memory-based size limit (2 GiB when browser memory cannot be detected, or higher when `performance.memory` / `navigator.deviceMemory` hints are available). BLAKE3 and BLAKE2b are not available via `crypto.subtle`.

Each implementation runs in its own long-lived worker. Workers are warmed up before timed runs so JIT and WASM compilation costs are not counted against the benchmark.

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`), drop a file, and click **Run benchmark**.

### OPFS sync access

Enable **Use OPFS sync access** to copy the file into the Origin Private File System once, then hash it via `FileSystemSyncAccessHandle` inside the workers with synchronous reads. In this mode you can sweep over multiple chunk sizes (configured in kilobytes).

Leave it off to hash the dropped `File` directly with async streaming. Chunk size is ignored in this mode because the browser controls how data is read from the stream.

## What it measures

For each run the benchmark records:

- Elapsed time (ms)
- Throughput (GB/s)
- Hash digest (hex)

Hashes from every implementation of the same algorithm and iteration are compared. Mismatches are highlighted in the results table. A summary ranks implementations by average throughput.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run preview` | Preview production build |

## Project layout

```
hash/
  sha256/
    asmjs/       # Custom asm.js SHA-256 + worker
    awasm-noble-simd/ # @awasm/noble wasm wrapper + worker
    awasm-noble-threads/ # @awasm/noble wasm_threads wrapper + worker
    wasm/        # hash-wasm wrapper + worker
    wasm-simd/   # @ult/hash-wasm SIMD wrapper + worker
    subtle/      # crypto.subtle.digest wrapper + worker
  blake3/
    awasm-noble-simd/
    awasm-noble-threads/
    wasm/
    wasm-simd/
  blake2/
    awasm-noble-simd/
    awasm-noble-threads/
    wasm/
lib/
  fs.ts          # OPFS read/write helpers
  session.ts     # Long-lived worker session wrapper
  awasm-noble-wasm/ # Tree-shaken @awasm/noble wasm backend glue
  awasm-noble-threads/ # Tree-shaken @awasm/noble wasm_threads backend glue
  awasm-worker.ts # Shared @awasm/noble worker harness
  wasm-worker.ts # Shared hash-wasm worker harness
  types.ts       # Shared types and interfaces
src/
  main.ts        # UI (file drop, controls, results table)
  benchmark.ts   # Benchmark orchestrator
  style.css
index.html
```
