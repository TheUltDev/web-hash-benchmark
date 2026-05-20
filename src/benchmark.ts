import asmjs from '../sha256/asmjs/index';
import wasm from '../sha256/wasm/index';

export interface HashImpl {
  name: string;
  start: (
    input: File,
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
  files: File[],
  iterations: number,
  onProgress?: (update: ProgressUpdate) => void,
): Promise<{rows: BenchmarkRow[]; summary: BenchmarkSummary[]}> {
  const rows: BenchmarkRow[] = [];
  const hashesByFile = new Map<string, Map<string, string>>();

  for (const file of files) {
    const fileHashes = new Map<string, string>();

    for (let iter = 1; iter <= iterations; iter++) {
      for (const impl of implementations) {
        const jobId = nextJobId++;
        const label = `${file.name} · ${impl.name} · #${iter}`;
        const start = performance.now();

        const hash = await impl.start(
          file,
          (bytes, total) => onProgress?.({jobId: String(jobId), label, bytes, total}),
          jobId,
        );

        const elapsedMs = performance.now() - start;
        const throughputMbps = file.size / (elapsedMs / 1000) / (1024 * 1024);

        fileHashes.set(`${impl.name}:${iter}`, hash);

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

    hashesByFile.set(file.name, fileHashes);
  }

  for (const row of rows) {
    const fileHashes = hashesByFile.get(row.fileName);
    if (!fileHashes) continue;

    const reference = fileHashes.get(`asmjs:${row.iteration}`);
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
