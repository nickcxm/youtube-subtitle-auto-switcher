import type { PaddleOCR } from '@paddleocr/paddleocr-js';
import { MODELS, MODEL_ROOT, isProfile, type Profile } from './models';
import { messageError, type OcrResult } from './shared';
const CACHE = 'local-captions-models-v1';
type Inventory = Record<string, { file: string; size: number; sha256: string }>;
const inventoryPromise: Promise<Inventory> = fetch(chrome.runtime.getURL('models/bundled.json')).then(r => r.json());
let engine: Awaited<ReturnType<typeof PaddleOCR.create>> | undefined;
let engineKey = '';
let stage = 'idle';
let queue: Promise<unknown> = Promise.resolve();
function filename(name: string) { return `${name}_onnx_infer.tar`; }
async function asset(name: string): Promise<string> {
  const inventory = await inventoryPromise;
  if (inventory[name]) return chrome.runtime.getURL(`models/${inventory[name].file}`);
  const url = MODEL_ROOT + filename(name), cache = await caches.open(CACHE);
  const cached = await cache.match(url);
  if (!cached) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`下载模型失败：HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 100000 || new TextDecoder().decode(bytes.slice(257, 262)) !== 'ustar') throw new Error('下载内容不是有效模型');
    await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) } }));
  }
  return url;
}
const localFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(MODEL_ROOT)) {
    const cached = await (await caches.open(CACHE)).match(url);
    if (!cached) throw new Error('模型尚未准备好');
    return cached;
  }
  return fetch(input, init);
};
async function recognize(profile: Profile, backend: 'auto' | 'wasm', image: string): Promise<OcrResult> {
  const key = `${profile}:${backend}`;
  if (!engine || engineKey !== key) {
    await engine?.dispose(); engine = undefined; engineKey = '';
    stage = 'preparing-model';
    const recognitionUrl = await asset(MODELS[profile].name);
    stage = 'loading-sdk';
    const { PaddleOCR: SDK } = await import('@paddleocr/paddleocr-js');
    stage = 'initializing-runtime';
    engine = await SDK.create({
      worker: false,
      textDetectionModelName: 'PP-OCRv5_mobile_det',
      textDetectionModelAsset: { url: await asset('PP-OCRv5_mobile_det') },
      textRecognitionModelName: MODELS[profile].name,
      textRecognitionModelAsset: { url: recognitionUrl },
      textRecognitionBatchSize: 4,
      fetch: localFetch,
      ortOptions: { backend, wasmPaths: chrome.runtime.getURL('ort/'), numThreads: 1, simd: true, proxy: false },
    });
    engineKey = key;
  }
  const bytes = Uint8Array.from(atob(image.slice(image.indexOf(',') + 1)), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  stage = 'recognizing';
  const [result] = await engine.predict(blob, { textRecScoreThresh: 0.5 });
  stage = 'idle';
  return { lines: result.items.map(line => ({ text: line.text, score: line.score, poly: line.poly as [number, number][] })), duration: result.metrics.totalMs, backend: `${result.runtime.detProvider}/${result.runtime.recProvider}` };
}
async function modelStatus() {
  const inventory = await inventoryPromise, cache = await caches.open(CACHE);
  return Promise.all(Object.entries(MODELS).map(async ([id, m]) => {
    if (inventory[m.name]) return { id, label: m.label, state: 'bundled', size: inventory[m.name].size };
    const response = await cache.match(MODEL_ROOT + filename(m.name));
    return { id, label: m.label, state: response ? 'cached' : 'missing', size: response ? Number(response.headers.get('Content-Length')) : 0 };
  }));
}
async function dispatch(message: Record<string, unknown>) {
  if (message.type === 'PING') return true;
  if (message.type === 'MODELS') return modelStatus();
  if (message.type === 'CLEAR_MODELS') {
    await engine?.dispose(); engine = undefined; engineKey = ''; await caches.delete(CACHE); return modelStatus();
  }
  if (!isProfile(message.profile)) throw new Error('不支持的模型');
  if (message.type === 'DOWNLOAD') { await asset(MODELS[message.profile].name); return modelStatus(); }
  if (message.type === 'OCR') {
    if (typeof message.image !== 'string' || message.image.length > 2000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(message.image)) throw new Error('无效的视频帧');
    return recognize(message.profile, message.backend === 'wasm' ? 'wasm' : 'auto', message.image);
  }
  throw new Error('未知操作');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'offscreen' || sender.id !== chrome.runtime.id) return;
  if (message.type === 'PING') { respond({ ok: true, data: { stage } }); return; }
  const job = queue.then(() => dispatch(message));
  queue = job.catch(() => undefined);
  job.then(data => respond({ ok: true, data }), error => respond({ ok: false, error: messageError(error) }));
  return true;
});
