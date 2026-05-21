import {isWasmSimdSupported} from '@ult/hash-wasm';
import sha256Asmjs from '../hash/sha256/asmjs/index';
import sha256Wasm from '../hash/sha256/wasm/index';
import sha256WasmSimd from '../hash/sha256/wasm-simd/index';
import blake3Wasm from '../hash/blake3/wasm/index';
import blake3WasmSimd from '../hash/blake3/wasm-simd/index';
import blake2Wasm from '../hash/blake2/wasm/index';
import {removeOpfsPath, writeFileToOpfs} from '../hash/common/fs';
import {DEFAULT_CHUNK_SIZE, type AlgoImpl, type FileSystemIn} from '../hash/common/types';

export const wasmSimdSupported = isWasmSimdSupported();

export type {HashSession} from '../hash/common/types';

// chunkSize === 0 indicates the streaming path (browser-chosen chunks).
export const STREAM_CHUNK = 0;

export interface BenchmarkRow {
  fileName: string;
  fileSize: number;
  algoName: string;
  implName: string;
  chunkSize: number;
  iteration: number;
  elapsedMs: number;
  throughputMbps: number;
  hash: string;
  match: boolean | null;
}

export interface BenchmarkSummary {
  algoName: string;
  implName: string;
  chunkSize: number;
  totalBytes: number;
  totalMs: number;
  avgMbps: number;
}

export interface ProgressUpdate {
  jobId: string;
  label: string;
  bytes: number;
  total: number;
}

export interface RunOptions {
  sync: boolean;
  chunkSizes?: number[];
}

export const implementations: AlgoImpl[] = [
  {algoName: 'SHA-256', name: 'hash-wasm', ...sha256Wasm},
  ...(wasmSimdSupported
    ? [{algoName: 'SHA-256', name: 'hash-wasm (simd)', ...sha256WasmSimd}]
    : []),
  {algoName: 'SHA-256', name: 'asmjs', ...sha256Asmjs},
  {algoName: 'BLAKE3', name: 'hash-wasm', ...blake3Wasm},
  ...(wasmSimdSupported
    ? [{algoName: 'BLAKE3', name: 'hash-wasm (simd)', ...blake3WasmSimd}]
    : []),
  {algoName: 'BLAKE2b', name: 'hash-wasm', ...blake2Wasm},
];

let nextJobId = 0;

export async function runBenchmark(
  file: File,
  iterations: number,
  options: RunOptions,
  onProgress?: (update: ProgressUpdate) => void,
): Promise<{rows: BenchmarkRow[]; summary: BenchmarkSummary[]}> {
  const rows: BenchmarkRow[] = [];

  // In streaming mode, the chunk size is whatever the underlying ReadableStream
  // produces, so sweeping is meaningless — collapse to a single virtual entry.
  const requestedChunks = options.chunkSizes?.length
    ? options.chunkSizes
    : [DEFAULT_CHUNK_SIZE];
  const chunkSizes = options.sync ? requestedChunks : [STREAM_CHUNK];

  let input: FileSystemIn = file;
  let opfsPath: string | undefined;

  if (options.sync) {
    opfsPath = await writeFileToOpfs(file);
    input = opfsPath;
  }

  // One long-lived worker per impl so the WASM module is compiled and the
  // hot path is tiered up to optimized code once, not on every iteration.
  const sessions = implementations.map((impl) => ({impl, session: impl.create()}));

  try {
    // Run a cheap synthetic hash in every worker to push the engine through
    // baseline -> optimized compilation before any timed run starts.
    await Promise.all(sessions.map(({session}) => session.warmup()));

    for (let iter = 1; iter <= iterations; iter++) {
      for (const chunkSize of chunkSizes) {
        for (const {impl, session} of sessions) {
          const jobId = nextJobId++;
          const label = `${file.name} · ${impl.algoName} · ${impl.name} · ${formatChunkSize(chunkSize)} · #${iter}`;

          const {hash, elapsedMs} = await session.hash(
            input,
            (bytes, total) => onProgress?.({jobId: String(jobId), label, bytes, total}),
            chunkSize === STREAM_CHUNK ? undefined : chunkSize,
          );

          const throughputMbps = file.size / (elapsedMs / 1000) / (1024 * 1024);

          rows.push({
            fileName: file.name,
            fileSize: file.size,
            algoName: impl.algoName,
            implName: impl.name,
            chunkSize,
            iteration: iter,
            elapsedMs,
            throughputMbps,
            hash,
            match: null,
          });
        }
      }
    }
  } finally {
    for (const {session} of sessions) session.dispose();
    if (opfsPath) await removeOpfsPath(opfsPath);
  }

  // All impls + chunk sizes for the same algorithm and iteration must produce
  // the same digest; use the first row of each group as the reference.
  const referenceByAlgoIter = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.algoName}:${row.iteration}`;
    if (!referenceByAlgoIter.has(key)) {
      referenceByAlgoIter.set(key, row.hash);
    }
  }
  for (const row of rows) {
    const reference = referenceByAlgoIter.get(`${row.algoName}:${row.iteration}`);
    row.match = reference !== undefined && row.hash === reference;
  }

  const summary: BenchmarkSummary[] = [];
  for (const impl of implementations) {
    for (const chunkSize of chunkSizes) {
      const implRows = rows.filter(
        (r) =>
          r.algoName === impl.algoName &&
          r.implName === impl.name &&
          r.chunkSize === chunkSize,
      );
      if (implRows.length === 0) continue;
      const totalBytes = implRows.reduce((sum, r) => sum + r.fileSize, 0);
      const totalMs = implRows.reduce((sum, r) => sum + r.elapsedMs, 0);
      const avgMbps = totalMs > 0 ? totalBytes / (totalMs / 1000) / (1024 * 1024) : 0;
      summary.push({
        algoName: impl.algoName,
        implName: impl.name,
        chunkSize,
        totalBytes,
        totalMs,
        avgMbps,
      });
    }
  }

  summary.sort((a, b) => b.avgMbps - a.avgMbps);

  return {rows, summary};
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatChunkSize(bytes: number): string {
  if (bytes === STREAM_CHUNK) return 'stream';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(1)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function formatMbps(mbps: number): string {
  return `${mbps.toFixed(2)} MB/s`;
}

export function truncateHash(hash: string, len = 12): string {
  return hash.length <= len ? hash : `${hash.slice(0, len)}…`;
}
