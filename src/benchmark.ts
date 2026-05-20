import asmjs from '../sha256/asmjs/index';
import wasm from '../sha256/wasm/index';
import {removeOpfsPath, writeFileToOpfs} from '../sha256/common';
import {DEFAULT_CHUNK_SIZE} from '../sha256/types';
import type {FileSystemIn, HashResult} from '../sha256/types';

export interface HashSession {
  warmup: () => Promise<void>;
  hash: (
    input: FileSystemIn,
    progress?: (bytes: number, total: number) => void,
    chunkSize?: number,
  ) => Promise<HashResult>;
  dispose: () => void;
}

export interface HashImpl {
  name: string;
  create: () => HashSession;
}

export const implementations: HashImpl[] = [
  {name: 'hash-wasm', ...wasm},
  {name: 'asmjs', ...asmjs},
];

// chunkSize === 0 indicates the streaming path (browser-chosen chunks).
export const STREAM_CHUNK = 0;

export interface BenchmarkRow {
  fileName: string;
  fileSize: number;
  implName: string;
  chunkSize: number;
  iteration: number;
  elapsedMs: number;
  throughputMbps: number;
  hash: string;
  match: boolean | null;
}

export interface BenchmarkSummary {
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
          const label = `${file.name} · ${impl.name} · ${formatChunkSize(chunkSize)} · #${iter}`;

          const {hash, elapsedMs} = await session.hash(
            input,
            (bytes, total) => onProgress?.({jobId: String(jobId), label, bytes, total}),
            chunkSize === STREAM_CHUNK ? undefined : chunkSize,
          );

          const throughputMbps = file.size / (elapsedMs / 1000) / (1024 * 1024);

          rows.push({
            fileName: file.name,
            fileSize: file.size,
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

  // All impls + chunk sizes for the same iteration must produce the same digest;
  // use the first row of each iteration as the reference.
  const referenceByIter = new Map<number, string>();
  for (const row of rows) {
    if (!referenceByIter.has(row.iteration)) {
      referenceByIter.set(row.iteration, row.hash);
    }
  }
  for (const row of rows) {
    const reference = referenceByIter.get(row.iteration);
    row.match = reference !== undefined && row.hash === reference;
  }

  const summary: BenchmarkSummary[] = [];
  for (const impl of implementations) {
    for (const chunkSize of chunkSizes) {
      const implRows = rows.filter(
        (r) => r.implName === impl.name && r.chunkSize === chunkSize,
      );
      if (implRows.length === 0) continue;
      const totalBytes = implRows.reduce((sum, r) => sum + r.fileSize, 0);
      const totalMs = implRows.reduce((sum, r) => sum + r.elapsedMs, 0);
      const avgMbps = totalMs > 0 ? totalBytes / (totalMs / 1000) / (1024 * 1024) : 0;
      summary.push({implName: impl.name, chunkSize, totalBytes, totalMs, avgMbps});
    }
  }

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
