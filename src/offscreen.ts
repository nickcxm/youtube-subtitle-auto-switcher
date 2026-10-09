import { MODELS, MODEL_ROOT, isProfile, type Profile } from './models';
import { messageError, type OcrResult, type Reply } from './shared';
import { JobQueue } from './jobs';
const CACHE = 'local-captions-models-v1';
type Inventory = Record<string, { file: string; size: number; sha256: string }>;
const jobs = new JobQueue();
let worker: Worker | undefined;
async function inventory(): Promise<Inventory> {
  const response = await fetch(chrome.runtime.getURL('models/bundled.json'));
  if (!response.ok) throw new Error('内置模型清单不可用'); return response.json();
}
async function asset(name: string, signal: AbortSignal): Promise<string> {
  const bundled = await inventory();
  if (bundled[name]) return chrome.runtime.getURL(`models/${bundled[name].file}`);
  const url = `${MODEL_ROOT}${name}_onnx_infer.tar`, cache = await caches.open(CACHE);
  if (!await cache.match(url)) {
    const controller = new AbortController(), abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, 180000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`下载模型失败：HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 100000 || bytes.byteLength > 40 * 1048576 || new TextDecoder().decode(bytes.slice(257, 262)) !== 'ustar') throw new Error('下载内容不是有效模型');
      signal.throwIfAborted();
      await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) } }));
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }
  return url;
}
function release() { worker?.terminate(); worker = undefined; }
async function recognize(m: Record<string, unknown>, signal: AbortSignal): Promise<OcrResult> {
  const profile = m.profile as Profile;
  const detUrl = await asset('PP-OCRv5_mobile_det', signal), recUrl = await asset(MODELS[profile].name, signal);
  signal.throwIfAborted();
  worker ??= new Worker(chrome.runtime.getURL('ocr-worker.js'), { type: 'module' });
  const activeWorker = worker;
  // Execution timeout starts only after downloads and queue wait, and kills only this task's Worker.
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); activeWorker.removeEventListener('message', done); activeWorker.removeEventListener('error', failed); };
    const fail = (error: Error) => { cleanup(); release(); reject(error); };
    const abort = () => fail(new DOMException('操作已取消', 'AbortError'));
    const failed = () => fail(new Error('本地 OCR Worker 加载失败'));
    const done = (event: MessageEvent<Reply<OcrResult>>) => { cleanup(); if (event.data.ok) resolve(event.data.data); else { release(); reject(new Error(event.data.error)); } };
    const timer = setTimeout(() => fail(new Error('本地推理超时，请重试或使用 WASM 模式')), 90000);
    signal.addEventListener('abort', abort, { once: true });
    activeWorker.addEventListener('message', done); activeWorker.addEventListener('error', failed);
    activeWorker.postMessage({ ...m, detUrl, recUrl, ortUrl: chrome.runtime.getURL('ort/') });
  });
}
async function modelStatus() {
  const bundled = await inventory(), cache = await caches.open(CACHE);
  return Promise.all(Object.entries(MODELS).map(async ([id, m]) => {
    if (bundled[m.name]) return { id, label: m.label, state: 'bundled', size: bundled[m.name].size };
    const response = await cache.match(`${MODEL_ROOT}${m.name}_onnx_infer.tar`);
    return { id, label: m.label, state: response ? 'cached' : 'missing', size: Number(response?.headers.get('Content-Length') ?? 0) };
  }));
}
async function execute(m: Record<string, unknown>, signal: AbortSignal) {
  if (m.operation === 'CLEAR_MODELS') { release(); await caches.delete(CACHE); return modelStatus(); }
  if (!isProfile(m.profile)) throw new Error('不支持的模型');
  if (m.operation === 'DOWNLOAD') { await asset(MODELS[m.profile].name, signal); return modelStatus(); }
  if (m.operation === 'OCR') {
    if (typeof m.image !== 'string' || m.image.length > 2000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.image)) throw new Error('无效的视频帧');
    return recognize(m, signal);
  }
  throw new Error('未知任务');
}
chrome.runtime.onMessage.addListener((m, sender, respond) => {
  if (m?.target !== 'offscreen' || sender.id !== chrome.runtime.id) return;
  void (async () => {
    try {
      let data: unknown;
      switch (m.type) {
        case 'PING': data = true; break;
        case 'MODELS': data = await modelStatus(); break;
        case 'JOB_SUBMIT': data = { requestId: jobs.submit(m.owner, signal => execute(m, signal)) }; break;
        case 'JOB_POLL': data = jobs.poll(m.requestId, m.owner); break;
        case 'JOB_CANCEL': jobs.cancel(m.requestId, m.owner); data = true; break;
        case 'RELEASE_IDLE': {
          const released = jobs.idle && Date.now() - jobs.lastActivity > 5 * 60000;
          if (released) release(); data = { released }; break;
        }
        default: throw new Error('未知请求');
      }
      respond({ ok: true, data });
    } catch (error) { respond({ ok: false, error: messageError(error) }); }
  })(); return true;
});
