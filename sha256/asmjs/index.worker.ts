/// <reference lib="webworker"/>

import {Sha256} from './lib/index';
import {bytesToHex, getFileAccess} from '../common';
import {DEFAULT_CHUNK_SIZE, type HashWorkerIn} from '../types';

// Reused across messages so V8 has every opportunity to tier the hot loop up
// to its optimizing compiler before any timed run.
const WARMUP_BUFFER = new Uint8Array(256 * 1024);

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
  // A few passes through the hot path are enough for V8 to swap baseline for
  // optimized code; the hash output itself is discarded.
  for (let i = 0; i < 4; i++) {
    const hash = new Sha256();
    hash.process(WARMUP_BUFFER);
    hash.finish();
  }
}

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
