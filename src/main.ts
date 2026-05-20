import {
  runBenchmark,
  formatBytes,
  formatMs,
  formatMbps,
  truncateHash,
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
const progressSection = document.getElementById('progress-section')!;
const progressBars = document.getElementById('progress-bars')!;
const resultsBody = document.getElementById('results-body')!;
const summaryEl = document.getElementById('summary')!;

let selectedFiles: File[] = [];
let running = false;

function updateFileList() {
  if (selectedFiles.length === 0) {
    fileList.innerHTML = '';
    runBtn.disabled = true;
    clearBtn.disabled = true;
    return;
  }

  fileList.innerHTML = `<ul>${selectedFiles
    .map(
      (f) =>
        `<li><span class="name">${escapeHtml(f.name)}</span><span>${formatBytes(f.size)}</span></li>`,
    )
    .join('')}</ul>`;
  runBtn.disabled = running;
  clearBtn.disabled = running;
}

function addFiles(files: FileList | File[]) {
  const incoming = Array.from(files);
  const existing = new Set(selectedFiles.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
  for (const f of incoming) {
    const key = `${f.name}:${f.size}:${f.lastModified}`;
    if (!existing.has(key)) {
      selectedFiles.push(f);
      existing.add(key);
    }
  }
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
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) addFiles(fileInput.files);
  fileInput.value = '';
});

clearBtn.addEventListener('click', () => {
  selectedFiles = [];
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
    <h3>Summary</h3>
    ${summaries
      .map(
        (s) => `
      <dl>
        <dt>${escapeHtml(s.implName)}</dt>
        <dd></dd>
        <dt>Total processed</dt>
        <dd>${formatBytes(s.totalBytes)}</dd>
        <dt>Total time</dt>
        <dd>${formatMs(s.totalMs)}</dd>
        <dt>Average throughput</dt>
        <dd>${formatMbps(s.avgMbps)}</dd>
      </dl>
    `,
      )
      .join('')}
  `;
}

runBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0 || running) return;

  running = true;
  runBtn.disabled = true;
  clearBtn.disabled = true;
  resultsBody.innerHTML = '';
  summaryEl.hidden = true;
  progressSection.hidden = false;
  progressBars.innerHTML = '';
  progressElements.clear();

  const iterations = Math.max(1, Math.min(10, parseInt(iterationsInput.value, 10) || 1));

  try {
    const {rows, summary} = await runBenchmark(
      selectedFiles,
      iterations,
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
    resultsBody.innerHTML = `<tr><td colspan="8" style="color:var(--error)">Error: ${escapeHtml(msg)}</td></tr>`;
  } finally {
    running = false;
    progressSection.hidden = true;
    updateFileList();
  }
});

updateFileList();
