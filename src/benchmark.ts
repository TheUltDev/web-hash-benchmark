import asmjs from '../sha256/asmjs/index';
import wasm from '../sha256/wasm/index';
import {removeOpfsPath, writeFileToOpfs} from '../sha256/common';
import type {FileSystemIn} from '../sha256/types';

export interface HashImpl {
  name: string;
  start: (
    input: FileSystemIn,
    progress?: (bytes: number, total: number) => void,
    jobId?: number,
  ) => Promise<string>;
  cancel: (jobId: number) => void;
}

export const implementations: HashImpl[] = [
  {name: 'asmjs', ...asmjs},
  {name: 'hash-wasm', ...wasm},
];

export interface BenchmarkRow {
  fileName: string;
  fileSize: number;
  implName: string;
  iteration: number;
  elapsedMs: number;
  throughputMbps: number;
  hash: string;
  match: boolean | null;
}

export interface BenchmarkSummary {
  implName: string;
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

let nextJobId = 0;

export async function runBenchmark(
  file: File,
  iterations: number,
  options: {sync: boolean},
  onProgress?: (update: ProgressUpdate) => void,
): Promise<{rows: BenchmarkRow[]; summary: BenchmarkSummary[]}> {
  const rows: BenchmarkRow[] = [];
  const hashes = new Map<string, string>();

  let input: FileSystemIn = file;
  let opfsPath: string | undefined;

  if (options.sync) {
    opfsPath = await writeFileToOpfs(file);
    input = opfsPath;
  }

  try {
    for (let iter = 1; iter <= iterations; iter++) {
      for (const impl of implementations) {
        const jobId = nextJobId++;
        const label = `${file.name} · ${impl.name} · #${iter}`;
        const start = performance.now();

        const hash = await impl.start(
          input,
          (bytes, total) => onProgress?.({jobId: String(jobId), label, bytes, total}),
          jobId,
        );

        const elapsedMs = performance.now() - start;
        const throughputMbps = file.size / (elapsedMs / 1000) / (1024 * 1024);

        hashes.set(`${impl.name}:${iter}`, hash);

        rows.push({
          fileName: file.name,
          fileSize: file.size,
          implName: impl.name,
          iteration: iter,
          elapsedMs,
          throughputMbps,
          hash,
          match: null,
        });
      }
    }
  } finally {
    if (opfsPath) await removeOpfsPath(opfsPath);
  }

  for (const row of rows) {
    const reference = hashes.get(`asmjs:${row.iteration}`);
    row.match = reference !== undefined && row.hash === reference;
  }

  const summary: BenchmarkSummary[] = implementations.map((impl) => {
    const implRows = rows.filter((r) => r.implName === impl.name);
    const totalBytes = implRows.reduce((sum, r) => sum + r.fileSize, 0);
    const totalMs = implRows.reduce((sum, r) => sum + r.elapsedMs, 0);
    const avgMbps = totalMs > 0 ? totalBytes / (totalMs / 1000) / (1024 * 1024) : 0;
    return {implName: impl.name, totalBytes, totalMs, avgMbps};
  });

  return {rows, summary};
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
