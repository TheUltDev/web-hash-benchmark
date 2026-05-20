/// <reference lib="webworker"/>

import {Sha256} from './lib/index';
import {bytesToHex, getFileAccess} from '../common';
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
  const hash = new Sha256();
  let bytes = 0;
  if (file instanceof File) {
    const stream = file.stream();
    await stream.pipeTo(new WritableStream({
      write(chunk) {
        hash.process(chunk);
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
      hash.process(new Uint8Array(dat));
      bytes += dat.byteLength;
      progress(bytes);
    }
    file.close();
  }
  const digest = hash.finish().result;
  if (!digest) throw new Error('Unable to hash file');
  return bytesToHex(digest);
}
