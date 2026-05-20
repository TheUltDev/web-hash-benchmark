/// <reference lib="webworker"/>

import {createSHA256, sha256 as sha256OneShot} from 'hash-wasm';
import {getFileAccess, getFileBuffer} from '../common';
import type {FileSystemIn} from '../types';

// @ts-ignore
// biome-ignore lint/complexity/useLiteralKeys: TS doesn't know about deviceMemory
const MEMORY = navigator['deviceMemory'] || 0.2;
const CORES = Math.max(navigator.hardwareConcurrency || 1, 5);

const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;
const CHUNK_SIZE = 1 * MEGABYTE;
const INCREMENTAL_THRESHOLD = Math.max(
  20 * MEGABYTE,
  (MEMORY / CORES) * GIGABYTE - (200 * MEGABYTE),
);

self.onmessage = async (e: MessageEvent<FileSystemIn>) => {
  const [file, total] = await getFileAccess(e.data, true);

  if (total <= INCREMENTAL_THRESHOLD) {
    try {
      const hash = await hashSimple(file);
      self.postMessage({type: 'hash::complete', payload: hash});
    } catch (error) {
      self.postMessage({type: 'hash::failure', payload: error});
    }
  } else {
    try {
      const hash = await hashIncremental(file, total, (bytes) =>
        self.postMessage({type: 'hash::progress', payload: {bytes, total}}));
      self.postMessage({type: 'hash::complete', payload: hash});
    } catch (error) {
      self.postMessage({type: 'hash::failure', payload: error});
    }
  }
};

async function hashSimple(file: File | FileSystemSyncAccessHandle) {
  const buffer = await getFileBuffer(file);
  return sha256OneShot(new Uint8Array(buffer));
}

async function hashIncremental(
  file: File | FileSystemSyncAccessHandle,
  total: number,
  progress: (bytes: number) => void,
) {
  const hasher = await createSHA256();
  hasher.init();
  let bytes = 0;

  if (file instanceof File) {
    const stream = file.stream();
    await stream.pipeTo(new WritableStream({
      write(chunk) {
        hasher.update(chunk);
        bytes += chunk.byteLength;
        progress(bytes);
      },
    }));
  } else {
    const unitSize = Math.min(CHUNK_SIZE, total);
    const unitCount = Math.floor(total / unitSize);
    for (let unit = 0; unit <= unitCount; unit++) {
      const start = unitSize * unit;
      const end = Math.min(unitSize * (unit + 1), total);
      const dat = new ArrayBuffer(end - start);
      file.read(dat, {at: start});
      hasher.update(new Uint8Array(dat));
      bytes += dat.byteLength;
      progress(bytes);
    }
    file.close();
  }

  return hasher.digest('hex') as string;
}
