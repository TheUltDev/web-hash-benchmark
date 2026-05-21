export type FileSystemIn = string | File | FileSystemSyncAccessHandle;
export type FileSystemOut = File | FileSystemSyncAccessHandle;

export type HashWorkerIn =
  | {kind: 'warmup'}
  | {kind: 'hash'; input: FileSystemIn; chunkSize?: number};

export interface HashResult {
  hash: string;
  elapsedMs: number;
}

export interface HashSession {
  warmup: () => Promise<void>;
  hash: (
    input: FileSystemIn,
    progress?: (bytes: number, total: number) => void,
    chunkSize?: number,
  ) => Promise<HashResult>;
  dispose: () => void;
}

export interface AlgoImpl {
  algoName: string;
  name: string;
  create: () => HashSession;
}

// Default chunk size for OPFS sync reads (1 MiB).
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;
