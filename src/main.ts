import {
  runBenchmark,
  formatBytes,
  formatChunkSize,
  formatMs,
  formatMbps,
  truncateHash,
  wasmSimdSupported,
  type ProgressUpdate,
  type BenchmarkRow,
  type BenchmarkSummary,
} from './benchmark';

const simdBadge = document.getElementById('simd-badge')!;

function renderSimdBadge() {
  simdBadge.textContent = wasmSimdSupported
    ? 'WASM SIMD supported'
    : 'WASM SIMD not supported';
  simdBadge.className = wasmSimdSupported
    ? 'simd-badge simd-badge--yes'
    : 'simd-badge simd-badge--no';
  simdBadge.title = wasmSimdSupported
    ? 'This browser can run WebAssembly SIMD; hash-wasm (simd) variants are included in the benchmark.'
    : 'WebAssembly SIMD is unavailable; hash-wasm (simd) variants are omitted from the benchmark.';
}

const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileList = document.getElementById('file-list')!;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const iterationsInput = document.getElementById('iterations') as HTMLInputElement;
const chunkSizesInput = document.getElementById('chunk-sizes') as HTMLInputElement;
const syncInput = document.getElementById('sync-mode') as HTMLInputElement;
const progressSection = document.getElementById('progress-section')!;
const progressBars = document.getElementById('progress-bars')!;
const resultsBody = document.getElementById('results-body')!;
const summarySection = document.getElementById('summary-section')!;
const summaryBody = document.getElementById('summary-body')!;

function parseChunkSizes(raw: string): number[] {
  const parts = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sizes: number[] = [];
  for (const part of parts) {
    const kb = Number.parseInt(part, 10);
    if (Number.isFinite(kb) && kb > 0) sizes.push(kb * 1024);
  }
  return sizes;
}

let selectedFile: File | null = null;
let running = false;
let hideDropZone = false;

function updateChunkSizesEnabled() {
  // Chunk size only affects the OPFS sync path; in stream mode the browser
  // controls chunking, so the input is disabled to make that explicit.
  chunkSizesInput.disabled = running || !syncInput.checked;
}

function updateFileList() {
  dropZone.hidden = hideDropZone || running;

  if (!selectedFile) {
    fileList.innerHTML = '';
    runBtn.disabled = true;
    clearBtn.disabled = true;
    syncInput.disabled = false;
    updateChunkSizesEnabled();
    return;
  }

  fileList.innerHTML = `<ul><li><span class="name">${escapeHtml(selectedFile.name)}</span><span>${formatBytes(selectedFile.size)}</span></li></ul>`;
  runBtn.disabled = running;
  clearBtn.disabled = running;
  syncInput.disabled = running;
  updateChunkSizesEnabled();
}

function setFile(files: FileList | File[]) {
  const list = Array.from(files);
  if (list.length === 0) return;
  selectedFile = list[list.length - 1];
  updateFileList();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer?.files.length) setFile(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) setFile(fileInput.files);
  fileInput.value = '';
});

syncInput.addEventListener('change', updateChunkSizesEnabled);

clearBtn.addEventListener('click', () => {
  hideDropZone = false;
  selectedFile = null;
  resultsBody.innerHTML = '';
  summarySection.hidden = true;
  summaryBody.innerHTML = '';
  progressSection.hidden = true;
  progressBars.innerHTML = '';
  updateFileList();
});

const progressElements = new Map<string, {bar: HTMLElement; label: HTMLElement}>();

function ensureProgressBar(update: ProgressUpdate) {
  let el = progressElements.get(update.jobId);
  if (!el) {
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.dataset.jobId = update.jobId;

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = update.label;

    const track = document.createElement('div');
    track.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'fill';
    track.appendChild(fill);

    item.appendChild(label);
    item.appendChild(track);
    progressBars.appendChild(item);
    el = {bar: fill, label};
    progressElements.set(update.jobId, el);
  }
  return el;
}

function renderRow(row: BenchmarkRow) {
  const tr = document.createElement('tr');
  if (row.match === false) tr.classList.add('mismatch');

  const matchText =
    row.match === null ? '—' : row.match ? '✓' : '✗';
  const matchClass =
    row.match === null ? 'match-na' : row.match ? 'match-yes' : 'match-no';

  tr.innerHTML = `
    <td>${escapeHtml(row.fileName)}</td>
    <td>${formatBytes(row.fileSize)}</td>
    <td>${escapeHtml(row.algoName)}</td>
    <td>${escapeHtml(row.implName)}</td>
    <td>${formatChunkSize(row.chunkSize)}</td>
    <td>${row.iteration}</td>
    <td>${formatMs(row.elapsedMs)}</td>
    <td>${formatMbps(row.throughputMbps)}</td>
    <td class="hash-cell" title="${escapeHtml(row.hash)}">${truncateHash(row.hash)}</td>
    <td class="${matchClass}">${matchText}</td>
  `;
  resultsBody.appendChild(tr);
}

function renderSummary(summaries: BenchmarkSummary[]) {
  summaryBody.innerHTML = summaries
    .map(
      (s, index) => `
    <tr${index === 0 ? ' class="summary-winner"' : ''}>
      <td>${escapeHtml(s.algoName)}</td>
      <td>${escapeHtml(s.implName)}</td>
      <td>${formatChunkSize(s.chunkSize)}</td>
      <td>${formatBytes(s.totalBytes)}</td>
      <td>${formatMs(s.totalMs)}</td>
      <td>${formatMbps(s.avgMbps)}</td>
    </tr>
  `,
    )
    .join('');
  summarySection.hidden = summaries.length === 0;
}

runBtn.addEventListener('click', async () => {
  if (!selectedFile || running) return;

  running = true;
  hideDropZone = true;
  updateFileList();
  runBtn.disabled = true;
  clearBtn.disabled = true;
  syncInput.disabled = true;
  resultsBody.innerHTML = '';
  summarySection.hidden = true;
  summaryBody.innerHTML = '';
  progressSection.hidden = false;
  progressBars.innerHTML = '';
  progressElements.clear();

  const iterations = Math.max(1, Math.min(10, parseInt(iterationsInput.value, 10) || 1));
  const sync = syncInput.checked;
  const chunkSizes = parseChunkSizes(chunkSizesInput.value);

  try {
    const {rows, summary} = await runBenchmark(
      selectedFile,
      iterations,
      {sync, chunkSizes},
      (update) => {
        const el = ensureProgressBar(update);
        const pct = update.total > 0 ? (update.bytes / update.total) * 100 : 0;
        el.bar.style.width = `${pct}%`;
        el.label.textContent = `${update.label} — ${pct.toFixed(1)}%`;
      },
    );

    for (const row of rows) renderRow(row);
    renderSummary(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    resultsBody.innerHTML = `<tr><td colspan="10" style="color:var(--error)">Error: ${escapeHtml(msg)}</td></tr>`;
  } finally {
    running = false;
    progressSection.hidden = true;
    updateFileList();
  }
});

renderSimdBadge();
updateFileList();
