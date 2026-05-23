/// <reference lib="webworker"/>

import {bytesToHex, getFileAccess} from './fs';
import {DEFAULT_CHUNK_SIZE, type HashWorkerIn} from './types';

interface AwasmHashStream {
  update(data: Uint8Array): AwasmHashStream;
  digest(): Uint8Array;
}

interface AwasmHash {
  create(): AwasmHashStream;
}

const WARMUP_BUFFER = new Uint8Array(256 * 1024);

export function runAwasmWorker(hashFn: AwasmHash) {
  self.onmessage = async (e: MessageEvent<HashWorkerIn>) => {
    const msg = e.data;
    try {
      if (msg.kind === 'warmup') {
        runWarmup();
        self.postMessage({type: 'hash::warmed'});
        return;
      }
      const {input, chunkSize = DEFAULT_CHUNK_SIZE} = msg;
      const [file, total] = await getFileAccess(input, true);
      const result = await hashFile(file, total, chunkSize, (bytes) =>
        self.postMessage({type: 'hash::progress', payload: {bytes, total}}));
      self.postMessage({type: 'hash::complete', payload: result});
    } catch (error) {
      self.postMessage({type: 'hash::failure', payload: error});
    }
  };

  function runWarmup() {
    for (let i = 0; i < 4; i++) {
      hashFn.create().update(WARMUP_BUFFER).digest();
    }
  }

  async function hashFile(
    file: File | FileSystemSyncAccessHandle,
    total: number,
    chunkSize: number,
    progress: (bytes: number) => void,
  ) {
    const hasher = hashFn.create();
    const start = performance.now();
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

    const hash = bytesToHex(hasher.digest());
    return {hash, elapsedMs: performance.now() - start};
  }
}
