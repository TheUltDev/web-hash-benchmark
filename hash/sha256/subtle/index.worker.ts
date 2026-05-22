/// <reference lib="webworker"/>

import {bytesToHex, getFileBuffer} from '../../../lib/fs';
import type {FileSystemIn, HashWorkerIn} from '../../../lib/types';

const WARMUP_BUFFER = new Uint8Array(256 * 1024);

self.onmessage = async (e: MessageEvent<HashWorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.kind === 'warmup') {
      await runWarmup();
      self.postMessage({type: 'hash::warmed'});
      return;
    }
    const {input} = msg;
    const result = await hashFile(input, (bytes, total) =>
      self.postMessage({type: 'hash::progress', payload: {bytes, total}}));
    self.postMessage({type: 'hash::complete', payload: result});
  } catch (error) {
    self.postMessage({type: 'hash::failure', payload: error});
  }
};

async function runWarmup() {
  for (let i = 0; i < 4; i++) {
    await crypto.subtle.digest('SHA-256', WARMUP_BUFFER);
  }
}

async function hashFile(
  input: FileSystemIn,
  progress: (bytes: number, total: number) => void,
) {
  const start = performance.now();
  const buffer = await getFileBuffer(input);
  const total = buffer.byteLength;
  progress(total, total);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return {hash: bytesToHex(digest), elapsedMs: performance.now() - start};
}
