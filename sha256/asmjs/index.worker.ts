/// <reference lib="webworker"/>

import {Sha256} from './lib/index';
import {bytesToHex, getFileAccess} from '../common';
import {DEFAULT_CHUNK_SIZE, type HashWorkerIn} from '../types';

self.onmessage = async (e: MessageEvent<HashWorkerIn>) => {
  const {input, chunkSize = DEFAULT_CHUNK_SIZE} = e.data;
  const [file, total] = await getFileAccess(input, true);
  try {
    const result = await hashFile(file, total, chunkSize, (bytes) =>
      self.postMessage({type: 'hash::progress', payload: {bytes, total}}));
    self.postMessage({type: 'hash::complete', payload: result});
  } catch (error) {
    self.postMessage({type: 'hash::failure', payload: error});
  }
};

async function hashFile(
  file: File | FileSystemSyncAccessHandle,
  total: number,
  chunkSize: number,
  progress: (bytes: number) => void,
) {
  const hash = new Sha256();
  const start = performance.now();
  let bytes = 0;
  if (file instanceof File) {
    // Streaming path: chunk size is dictated by the underlying ReadableStream
    // (typically ~64 KiB in Chromium); the configured chunkSize is ignored.
    const stream = file.stream();
    await stream.pipeTo(new WritableStream({
      write(chunk) {
        hash.process(chunk);
        bytes += chunk.byteLength;
        progress(bytes);
      },
    }));
  } else {
    const unitSize = Math.min(Math.max(chunkSize, 64), total) || 1;
    const buffer = new ArrayBuffer(unitSize);
    const view = new Uint8Array(buffer);
    let offset = 0;
    while (offset < total) {
      const len = Math.min(unitSize, total - offset);
      if (len === unitSize) {
        file.read(buffer, {at: offset});
        hash.process(view);
      } else {
        const tail = new ArrayBuffer(len);
        file.read(tail, {at: offset});
        hash.process(new Uint8Array(tail));
      }
      offset += len;
      bytes = offset;
      progress(bytes);
    }
    file.close();
  }
  const digest = hash.finish().result;
  if (!digest) throw new Error('Unable to hash file');
  return {hash: bytesToHex(digest), elapsedMs: performance.now() - start};
}
