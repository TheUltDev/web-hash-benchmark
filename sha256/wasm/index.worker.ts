/// <reference lib="webworker"/>

import {createSHA256} from 'hash-wasm';
import {getFileAccess} from '../common';
import type {FileSystemIn} from '../types';

const CHUNK_SIZE = 1024 * 1024;

self.onmessage = async (e: MessageEvent<FileSystemIn>) => {
  const [file, total] = await getFileAccess(e.data, true);

  try {
    const hash = await hashFile(file, total, (bytes) =>
      self.postMessage({type: 'hash::progress', payload: {bytes, total}}));
    self.postMessage({type: 'hash::complete', payload: hash});
  } catch (error) {
    self.postMessage({type: 'hash::failure', payload: error});
  }
};

async function hashFile(
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
