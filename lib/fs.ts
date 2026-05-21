import {Path} from './path';
import type {FileSystemIn, FileSystemOut} from './types';

let _root: FileSystemDirectoryHandle | undefined;

export async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!_root) {
    _root = await navigator.storage.getDirectory();
  }
  return _root;
}

export async function getFileHandle(
  path: string,
  opts?: FileSystemGetDirectoryOptions,
): Promise<FileSystemFileHandle | undefined> {
  const root = await getRoot();
  const steps = [...Path.from(path)];

  let cwd = root;
  let name = steps.shift();

  while (cwd && name) {
    if (steps.length > 0) {
      try {
        cwd = await cwd.getDirectoryHandle(name, opts);
      } catch {
        return undefined;
      }
    } else {
      try {
        return cwd.getFileHandle(name, opts);
      } catch {
        return undefined;
      }
    }
    name = steps.shift();
  }

  return undefined;
}

export async function getDirectoryHandle(
  path: string,
  opts?: FileSystemGetDirectoryOptions,
): Promise<FileSystemDirectoryHandle | undefined> {
  const root = await getRoot();
  const steps = [...Path.from(path)];
  let cwd = root;
  let name = steps.shift();

  while (cwd && name) {
    if (steps.length > 0) {
      try {
        cwd = await cwd.getDirectoryHandle(name, opts);
      } catch {
        return undefined;
      }
    } else {
      try {
        return cwd.getDirectoryHandle(name, opts);
      } catch {
        return undefined;
      }
    }
    name = steps.shift();
  }

  return undefined;
}

export async function getFileAccess(
  input: FileSystemIn,
  sync = false,
): Promise<[FileSystemOut, number]> {
  // Lookup path to get handle
  if (typeof input === 'string') {
    const handle = await getFileHandle(input);
    if (!handle) throw new Error('Unable to get file handle');
    const file = sync
      ? await handle.createSyncAccessHandle()
      : await handle.getFile();
    if (file instanceof File) {
      return [file, file.size];
    }
    return [file, file.getSize()];
  }

  // Given sync handle directly
  if (input instanceof FileSystemSyncAccessHandle) {
    return [input, input.getSize()];
  }

  // Given async handle directly
  return [input, input.size];
}

export async function writeFileToOpfs(file: File): Promise<string> {
  const name = `bench-${Date.now()}-${file.name}`;
  const handle = await getFileHandle(name, {create: true});
  if (!handle) throw new Error('Unable to create OPFS file handle');
  const writable = await handle.createWritable();
  await file.stream().pipeTo(writable);
  return name;
}

export async function removeOpfsPath(path: string): Promise<void> {
  const root = await getRoot();
  await root.removeEntry(path).catch(() => {});
}

export async function getFileBuffer(
  input: FileSystemIn,
): Promise<ArrayBuffer> {
  const [file, size] = await getFileAccess(input);
  // Async access to File
  if (file instanceof File) {
    const buffer = await file.arrayBuffer();
    return buffer;
  }
  // Sync access to OPFS
  const buffer = new ArrayBuffer(size);
  file.read(buffer, {at: 0});
  file.close();
  return buffer;
}

export function bytesToHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
