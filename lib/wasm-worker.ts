/// <reference lib="webworker"/>

import {getFileAccess} from './fs';
import {DEFAULT_CHUNK_SIZE, type HashWorkerIn} from './types';

interface IHasher {
  init(): unknown;
  update(data: Uint8Array): unknown;
  digest(outputType: 'hex'): string;
}

// Reused across messages so the WASM module gets compiled, instantiated, and
// tiered up to optimized code before any timed run begins.
const WARMUP_BUFFER = new Uint8Array(256 * 1024);

export function runHashWasmWorker(hasherReady: Promise<IHasher>) {
  self.onmessage = async (e: MessageEvent<HashWorkerIn>) => {
    const msg = e.data;
    try {
      if (msg.kind === 'warmup') {
        await runWarmup();
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

  async function runWarmup() {
    const hasher = await hasherReady;
    // A few passes through the hot path are enough for the WASM engine to swap
    // baseline (Liftoff) for optimized (TurboFan) code; output is discarded.
    for (let i = 0; i < 4; i++) {
      hasher.init();
      hasher.update(WARMUP_BUFFER);
      hasher.digest('hex');
    }
  }

  async function hashFile(
    file: File | FileSystemSyncAccessHandle,
    total: number,
    chunkSize: number,
    progress: (bytes: number) => void,
  ) {
    const hasher = await hasherReady;
    hasher.init();
    const start = performance.now();
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

    const hash = hasher.digest('hex');
    return {hash, elapsedMs: performance.now() - start};
  }
}
