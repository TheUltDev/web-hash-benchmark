// Used only when neither jsHeapSizeLimit nor deviceMemory is available.
const UNDETECTED_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export function getCryptoSubtleMaxBytes(): number {
  const perf = performance as Performance & {memory?: {jsHeapSizeLimit: number}};
  if (perf.memory?.jsHeapSizeLimit && perf.memory.jsHeapSizeLimit > 0) {
    // Leave headroom for the ArrayBuffer copy and digest work.
    return Math.floor(perf.memory.jsHeapSizeLimit * 0.5);
  }

  const deviceMemory = (navigator as Navigator & {deviceMemory?: number}).deviceMemory;
  if (typeof deviceMemory === 'number' && deviceMemory > 0) {
    return Math.floor(deviceMemory * 1024 * 1024 * 1024 * 0.25);
  }

  return UNDETECTED_MAX_BYTES;
}

export function canRunCryptoSubtle(fileSize: number): boolean {
  return fileSize <= getCryptoSubtleMaxBytes();
}
