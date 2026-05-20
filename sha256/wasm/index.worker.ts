/// <reference lib="webworker"/>

import {createSHA256} from 'hash-wasm';
import {getFileAccess} from '../common';
import {DEFAULT_CHUNK_SIZE, type HashWorkerIn} from '../types';

self.onmessage = async (e: MessageEvent<HashWorkerIn>) => {
  const {input, chunkSize = DEFAULT_CHUNK_SIZE} = e.data;
  const [file, total] = await getFileAccess(input, true);

  try {
    const hash = await hashFile(file, total, chunkSize, (bytes) =>
      self.postMessage({type: 'hash::progress', payload: {bytes, total}}));
    self.postMessage({type: 'hash::complete', payload: hash});
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
  const hasher = await createSHA256();
  hasher.init();
  let bytes = 0;

  if (file instanceof File) {
    // Streaming path: chunk size is dictated by the underlying ReadableStream
    // (typically ~64 KiB in Chromium); the configured chunkSize is ignored.
    const stream = file.stream();
    await stream.pipeTo(new WritableStream({
      write(chunk) {
        hasher.update(chunk);
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
        hasher.update(view);
      } else {
        const tail = new ArrayBuffer(len);
        file.read(tail, {at: offset});
        hasher.update(new Uint8Array(tail));
      }
      offset += len;
      bytes = offset;
      progress(bytes);
    }
    file.close();
  }

  return hasher.digest('hex') as string;
}
