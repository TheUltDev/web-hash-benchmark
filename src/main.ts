import {
  runBenchmark,
  formatBytes,
  formatChunkSize,
  formatMs,
  formatMbps,
  truncateHash,
  STREAM_CHUNK,
  type ProgressUpdate,
  type BenchmarkRow,
  type BenchmarkSummary,
} from './benchmark';

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
const summaryEl = document.getElementById('summary')!;

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

function updateChunkSizesEnabled() {
  // Chunk size only affects the OPFS sync path; in stream mode the browser
  // controls chunking, so the input is disabled to make that explicit.
  chunkSizesInput.disabled = running || !syncInput.checked;
}

function updateFileList() {
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
  selectedFile = null;
  resultsBody.innerHTML = '';
  summaryEl.hidden = true;
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
  summaryEl.hidden = false;
  summaryEl.innerHTML = `
    <div class="summary-columns">
      ${summaries
        .map(
          (s) => {
            const chunkBadge = s.chunkSize === STREAM_CHUNK
              ? ''
              : `<span class="summary-chunk">${formatChunkSize(s.chunkSize)} chunk size</span>`;
            return `
        <div class="summary-column">
          <h3 class="summary-impl">${escapeHtml(s.implName)}${chunkBadge ? ` ${chunkBadge}` : ''}</h3>
          <dl>
            <dt>Total processed</dt>
            <dd>${formatBytes(s.totalBytes)}</dd>
            <dt>Total time</dt>
            <dd>${formatMs(s.totalMs)}</dd>
            <dt>Average throughput</dt>
            <dd>${formatMbps(s.avgMbps)}</dd>
          </dl>
        </div>
      `;
          },
        )
        .join('')}
    </div>
  `;
}

runBtn.addEventListener('click', async () => {
  if (!selectedFile || running) return;

  running = true;
  runBtn.disabled = true;
  clearBtn.disabled = true;
  syncInput.disabled = true;
  resultsBody.innerHTML = '';
  summaryEl.hidden = true;
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
    resultsBody.innerHTML = `<tr><td colspan="9" style="color:var(--error)">Error: ${escapeHtml(msg)}</td></tr>`;
  } finally {
    running = false;
    progressSection.hidden = true;
    updateFileList();
  }
});

updateFileList();
