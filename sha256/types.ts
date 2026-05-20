export type FileSystemIn = string | File | FileSystemSyncAccessHandle;
export type FileSystemOut = File | FileSystemSyncAccessHandle;

export interface HashWorkerIn {
  input: FileSystemIn;
  chunkSize?: number;
}

// Default chunk size for OPFS sync reads (1 MiB).
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;
