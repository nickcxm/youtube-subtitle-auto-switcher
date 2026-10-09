import { encodeJpeg } from './images';
import { Evidence, normalize } from './decision';
import { profileForLanguage, type Profile } from './models';
import { DEFAULTS, effectiveRule, getSettings, request, messageError, type Settings, type Status, type OcrResult } from './shared';
const SCOPE = 'local-captions:metadata:v1';
type Metadata = { videoId: string; channelId: string; channelName: string; track: string; audio: string; language: string; available: boolean };
type Run = { controller: AbortController; id: number; busy: boolean; seen: Set<string>; evidence: Evidence; samples: number; errors: number; done: boolean; lastTime: number };
let settings: Settings = DEFAULTS;
let metadata: Metadata = { videoId: '', channelId: '', channelName: '', track: '', audio: '', language: '', available: false };
let videoId = '', generation = 0, manual = false, closed = false, state = '等待 YouTube 视频';
let run: Run = makeRun();
let host: HTMLElement | undefined, root: ShadowRoot | undefined, panel: HTMLElement | undefined;
let lastMetadata = 0, observedVideo: HTMLVideoElement | null = null;
function makeRun(): Run { return { controller: new AbortController(), id: ++generation, busy: false, seen: new Set(), evidence: new Evidence(), samples: 0, errors: 0, done: false, lastTime: -10 }; }
function currentId() { return location.pathname === '/watch' ? new URL(location.href).searchParams.get('v') ?? '' : ''; }
function cc() { return document.querySelector<HTMLButtonElement>('.ytp-subtitles-button'); }
function enabled() { return cc()?.getAttribute('aria-pressed') === 'true'; }
function setCC(on: boolean) {
  const button = cc();
  if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
  if (enabled() !== on) button.click();
  return enabled() === on;
}
function softText() { return [...document.querySelectorAll('.ytp-caption-segment')].map(e => e.textContent ?? '').join(' ').trim(); }
function cacheKey() { return JSON.stringify([1, videoId, metadata.track, settings.model, settings.crop]); }
function log(event: string, detail = '') { void request('LOG', { video: videoId, event, detail }).catch(() => undefined); }
function status(): Status { return { videoId, channelId: metadata.channelId, channelName: metadata.channelName, track: metadata.track, state, samples: run.samples, manual, closed }; }
function update(text: string) {
  state = text;
  const label = root?.querySelector('#state'); if (label) label.textContent = text;
  const info = root?.querySelector('#info'); if (info) info.textContent = `本地识别 · ${run.samples}/${settings.maxSamples} 次取样${manual ? ' · 手动优先' : ''}`;
  const restore = root?.querySelector<HTMLButtonElement>('#restore'); if (restore) restore.hidden = !closed;
  for (const kind of ['video', 'channel'] as const) {
    const select = root?.querySelector<HTMLSelectElement>(`#${kind}`);
    if (select && root?.activeElement !== select) select.value = (kind === 'video' ? settings.videoRules[videoId] : settings.channelRules[metadata.channelId]) ?? 'inherit';
    if (select) select.disabled = kind === 'video' ? !videoId : !metadata.channelId;
  }
}
async function restart(preserveManual = true, force = false) {
  const id = currentId(), previous = videoId;
  if (id !== previous) { manual = false; closed = false; metadata = { videoId: id, channelId: '', channelName: '', track: '', audio: '', language: '', available: false }; }
  if (!preserveManual) manual = false;
  videoId = id; root?.querySelector('#close-other')?.remove(); run.controller.abort(); run = makeRun(); const selected = run;
  settings = await getSettings(); if (run !== selected) return;
  if (!id) { selected.done = true; update('等待 YouTube 视频'); return; }
  update(manual ? '本次播放由你控制' : '等待字幕');
  if (manual) { selected.done = true; return; }
  if (closed && !force) { selected.done = true; update('已关闭软字幕，可随时恢复'); return; }
  const rule = effectiveRule(settings, id, metadata.channelId);
  if (rule !== 'inherit') {
    selected.done = true;
    update(setCC(rule === 'show') ? `已应用规则：${rule === 'show' ? '开启' : '关闭'}软字幕` : '等待播放器就绪');
    // tick retries the rule if the player is not ready yet.
    return;
  }
  if (settings.remember && settings.dedupe && metadata.track && !force) {
    const key = cacheKey(), found = await request<number | null>('CACHE_GET', { key });
    if (run !== selected || manual || currentId() !== id) return;
    if (found && Date.now() - found < 30 * 86400000 && setCC(false)) { closed = true; selected.done = true; update('已按上次确认结果关闭软字幕'); return; }
  }
}
function userOverride() {
  if (!videoId) return;
  manual = true; closed = false; run.controller.abort(); run = makeRun(); run.done = true; update('本次播放由你控制'); log('manual-override');
  // A user correction invalidates a remembered closure immediately.
  if (metadata.track) void request('CACHE_PUT', { key: cacheKey(), remove: true }).catch(() => undefined);
}
async function restore() {
  if (!setCC(true)) { update('当前无法恢复，请使用 YouTube CC'); return; }
  manual = true; closed = false; run.controller.abort(); run = makeRun(); run.done = true;
  if (metadata.track) await request('CACHE_PUT', { key: cacheKey(), remove: true });
  update('已恢复，本次播放由你控制'); log('undo');
}
async function recheck() {
  closed = false; setCC(true); await restart(false, true); if (!run.done) update('重新检测中'); scheduleTick();
}
function mount() {
  const controls = document.querySelector('.ytp-right-controls'); if (!controls || (host?.isConnected && controls.contains(host))) return;
  host = document.createElement('span'); host.id = 'local-captions'; host.style.cssText = 'display:inline-block;position:relative;vertical-align:top;height:100%;';
  root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{font:13px system-ui;color:#edf2f7}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}
    #toggle{height:100%;min-height:36px;padding:0 10px;background:none;border:0;color:white;font-weight:700;opacity:.9}
    #panel{position:absolute;right:0;bottom:52px;width:300px;padding:18px;background:#17212bf5;border:1px solid #ffffff25;border-radius:14px;box-shadow:0 12px 40px #0006;line-height:1.6;text-align:left;white-space:normal}
    #panel[hidden],button[hidden]{display:none}h3{margin:0 0 10px;font-size:15px}p{margin:8px 0;color:#b9c6d2}#state{color:#fff;min-height:40px}
    .actions{display:flex;gap:8px;flex-wrap:wrap} .actions button{padding:7px 10px;border:1px solid #ffffff30;background:#ffffff12;color:#fff;border-radius:7px}
    label{display:block;margin-top:12px}select{width:100%;padding:7px;background:#263442;color:white;border:1px solid #ffffff25;border-radius:7px;margin-top:4px}
    small{display:block;margin-top:12px;color:#a9bdcb}
  </style><button id="toggle" aria-controls="panel" aria-label="本地字幕管家" aria-expanded="false" title="本地字幕管家">LC</button>
  <section id="panel" role="region" aria-label="本地字幕管家设置" hidden><h3>本地字幕管家</h3><p id="state" role="status" aria-live="polite" aria-atomic="true"></p><p id="info"></p>
    <div class="actions"><button id="recheck">重新检测</button><button id="restore" hidden>恢复软字幕</button><button id="settings">设置</button></div>
    <label>当前视频<select id="video"><option value="inherit">继承频道 / 全局</option><option value="show">始终开启软字幕</option><option value="hide">始终关闭软字幕</option></select></label>
    <label>当前频道<select id="channel"><option value="inherit">继承全局设置</option><option value="show">始终开启软字幕</option><option value="hide">始终关闭软字幕</option></select></label>
    <small>视频规则优先于频道规则。手动 CC 只影响本次播放。画面留在本机。</small></section>`;
  controls.prepend(host); panel = root.querySelector<HTMLElement>('#panel')!;
  root.querySelector('#toggle')!.addEventListener('click', () => { setPanel(Boolean(panel!.hidden), true); update(state); });
  root.querySelector('#recheck')!.addEventListener('click', () => void safely(recheck));
  root.querySelector('#restore')!.addEventListener('click', () => void safely(restore));
  root.querySelector('#settings')!.addEventListener('click', () => void safely(() => request('OPEN_SETTINGS')));
  for (const kind of ['video', 'channel'] as const) root.querySelector(`#${kind}`)!.addEventListener('change', async event => {
    const id = kind === 'video' ? videoId : metadata.channelId;
    if (!id) return;
    try { await request('RULE', { kind, id, rule: (event.target as HTMLSelectElement).value }); closed = false; await restart(false, true); scheduleTick(); }
    catch (error) { update(messageError(error)); }
  });
  root.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPanel(false, true); } });
  update(state);
}
function setPanel(open: boolean, focus = false) {
  if (!panel || !root) return;
  panel.hidden = !open; root.querySelector('#toggle')!.setAttribute('aria-expanded', String(open));
  if (focus) root.querySelector<HTMLButtonElement>(open ? '#recheck' : '#toggle')?.focus();
}
async function safely(operation: () => Promise<unknown>) { try { await operation(); } catch (error) { update(messageError(error)); } }
function nextFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let callback: number | undefined;
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); if (callback !== undefined) video.cancelVideoFrameCallback(callback); };
    const done = () => { cleanup(); resolve(); };
    const abort = () => { cleanup(); reject(new DOMException('取帧已取消', 'AbortError')); };
    const timeout = setTimeout(done, 250);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    if (typeof video.requestVideoFrameCallback === 'function') callback = video.requestVideoFrameCallback(done);
    else requestAnimationFrame(done);
  });
}
async function frame(video: HTMLVideoElement) {
  const width = Math.min(960, video.videoWidth), sourceHeight = Math.round(video.videoHeight * settings.crop);
  const height = Math.max(1, Math.round(sourceHeight * width / video.videoWidth));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 不可用');
  context.drawImage(video, 0, video.videoHeight - sourceHeight, video.videoWidth, sourceHeight, 0, 0, width, height);
  return { image: await encodeJpeg(canvas), width, height };
}
async function tick() {
  bindDom(); mount();
  if (currentId() !== videoId) { await restart(); return; }
  if (!videoId) return;
  if (performance.now() - lastMetadata > 1500) { lastMetadata = performance.now(); window.postMessage({ scope: SCOPE, type: 'request' }, location.origin); }
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video, video');
  if (video !== observedVideo && video) {
    observedVideo = video;
    videoEvents?.abort(); videoEvents = new AbortController();
    for (const event of ['playing', 'loadeddata', 'seeked']) video.addEventListener(event, () => scheduleTick(), { signal: videoEvents.signal });
    video.addEventListener('seeking', () => { void safely(async () => { await restart(); scheduleTick(); }); }, { signal: videoEvents.signal });
  }
  if (manual || document.hidden || document.querySelector('#movie_player.ad-showing') || !video || video.paused || video.seeking || video.readyState < 2) return;
  const rule = effectiveRule(settings, videoId, metadata.channelId);
  if (rule !== 'inherit') { if (setCC(rule === 'show')) update(`已应用规则：${rule === 'show' ? '开启' : '关闭'}软字幕`); return; }
  if (closed) return;
  if (settings.autoOpen && !enabled() && metadata.available) setCC(true);
  const selected = run;
  if (!settings.dedupe || selected.done || selected.busy || !enabled()) return;
  let text = softText(), key = normalize(text);
  if (key.length < 4 || selected.seen.has(key)) return;
  const elapsed = video.currentTime - selected.lastTime;
  if (elapsed < 1.5) { scheduleTick((1.5 - elapsed) / Math.max(video.playbackRate, 0.1) * 1000); return; }
  if (selected.samples >= settings.maxSamples) { selected.done = true; update('证据不足，保留软字幕'); return; }
  selected.busy = true; selected.lastTime = video.currentTime;
  try {
    await nextFrame(video, selected.controller.signal);
    if (selected !== run || manual || document.hidden || video.paused || video.seeking) return;
    text = softText(); key = normalize(text);
    if (key.length < 4 || selected.seen.has(key)) return;
    const capturedTrack = metadata.track, capturedId = videoId, captured = await frame(video);
    selected.controller.signal.throwIfAborted();
    selected.seen.add(key); selected.samples++; update('本地识别中…');
    const language = metadata.audio || metadata.language || navigator.language;
    const profile: Profile = settings.model === 'auto' ? profileForLanguage(language) : settings.model;
    const result = await request<OcrResult>('OCR', { ...captured, profile, backend: settings.backend }, selected.controller.signal);
    if (selected !== run || manual || document.hidden || currentId() !== capturedId || metadata.track !== capturedTrack || document.querySelector('#movie_player.ad-showing')) return;
    log('ocr', `${Math.round(result.duration)}ms ${result.backend}`);
    const decision = selected.evidence.add(result.lines, text, captured.width, captured.height);
    if (decision === 'duplicate') {
      if (setCC(false)) {
        closed = true; selected.done = true; update('发现重复字幕，已关闭软字幕'); log('closed-duplicate');
        if (settings.remember && capturedTrack) await request('CACHE_PUT', { key: cacheKey() });
      }
    } else if (decision === 'different') {
      selected.done = true;
      if (settings.differentLanguage === 'hide' && setCC(false)) { closed = true; update('发现不同文字体系的硬字幕，已关闭软字幕'); }
      else if (settings.differentLanguage === 'ask') {
        update('画面可能有不同语言的字幕'); setPanel(true);
        const existing = root!.querySelector('#close-other'); existing?.remove();
        const button = document.createElement('button'); button.id = 'close-other'; button.textContent = '关闭软字幕';
        button.addEventListener('click', () => { if (selected !== run) { button.remove(); return; } if (setCC(false)) { closed = true; update('已关闭，可随时恢复'); } button.remove(); });
        root!.querySelector('.actions')!.append(button);
      } else update('可能有不同语言的硬字幕，保留软字幕');
    } else { selected.done = selected.samples >= settings.maxSamples; update(selected.done ? '证据不足，保留软字幕' : '等待下一段字幕验证'); }
  } catch (error) {
    if (selected !== run || (error instanceof DOMException && error.name === 'AbortError')) return;
    selected.errors++; log('ocr-error', 'local-runtime-failed');
    update(`识别未完成：${messageError(error).slice(0, 110)}`);
    if (selected.errors >= 2) selected.done = true;
  } finally { selected.busy = false; if (selected === run && !selected.done && !manual && !document.hidden) scheduleTick(); }
}
window.addEventListener('message', event => {
  const m = event.data;
  if (event.source !== window || event.origin !== location.origin || m?.scope !== SCOPE || m.type !== 'response' || m.videoId !== videoId) return;
  if (!['channelId', 'channelName', 'track', 'audio', 'language'].every(key => typeof m[key] === 'string' && m[key].length < 200) || typeof m.available !== 'boolean') return;
  if (!m.track && !enabled()) { m.track = metadata.track; m.language = metadata.language; }
  const availabilityChanged = m.available !== metadata.available;
  const changed = m.track !== metadata.track || m.channelId !== metadata.channelId;
  metadata = m;
  if (changed) { closed = false; void safely(async () => { await restart(); scheduleTick(); }); } else if (availabilityChanged) scheduleTick();
});
document.addEventListener('click', event => {
  if (event.isTrusted && event.target instanceof Element && (event.target.closest('.ytp-subtitles-button') || event.target.closest('.ytp-settings-menu [role="menuitemradio"]'))) userOverride();
}, true);
document.addEventListener('keydown', event => {
  if (!event.isTrusted || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'c') return;
  if (event.composedPath().some(node => node instanceof Element && node.matches('input,textarea,select,[contenteditable="true"],[role="textbox"]'))) return;
  userOverride();
}, true);
document.addEventListener('yt-navigate-start', () => { run.controller.abort(); run = makeRun(); run.done = true; });
document.addEventListener('yt-navigate-finish', () => void safely(async () => { await restart(); bindDom(); scheduleTick(); }));
chrome.storage.onChanged.addListener(changes => { if (changes.settings) void safely(async () => { await restart(); scheduleTick(); }); });
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target !== 'content') return;
  if (message.type === 'STATUS') { respond({ ok: true, data: status() }); return; }
  void (async () => {
    try { if (message.type === 'RECHECK') await recheck(); else if (message.type === 'RESTORE') await restore(); else throw new Error('未知操作'); respond({ ok: true, data: status() }); }
    catch (error) { respond({ ok: false, error: messageError(error) }); }
  })(); return true;
});
let scheduled: ReturnType<typeof setTimeout> | undefined, due = Infinity;
let captionContainer: Element | null = null, watchedPlayer: Element | null = null;
let videoEvents: AbortController | undefined;
const captionObserver = new MutationObserver(() => scheduleTick());
const playerObserver = new MutationObserver(records => {
  if (records.every(r => r.type === 'attributes' && r.target !== watchedPlayer)) return;
  bindDom(); mount();
  if (records.some(r => r.type === 'attributes' && r.target === watchedPlayer)) scheduleTick();
});
const bootstrapObserver = new MutationObserver(() => bindDom());
function scheduleTick(delay = 0) {
  const next = performance.now() + delay;
  if (scheduled !== undefined && due <= next) return;
  clearTimeout(scheduled); due = next;
  scheduled = setTimeout(() => { scheduled = undefined; due = Infinity; void safely(tick); }, delay);
}
function bindDom() {
  const player = document.getElementById('movie_player');
  if (player !== watchedPlayer) {
    playerObserver.disconnect(); watchedPlayer = player;
    if (player) { playerObserver.observe(player, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); bootstrapObserver.disconnect(); scheduleTick(); }
    else if (document.body) bootstrapObserver.observe(document.body, { childList: true, subtree: true });
  }
  if (!player && document.body) bootstrapObserver.observe(document.body, { childList: true, subtree: true });
  const container = document.querySelector('.ytp-caption-window-container') ?? document.querySelector('.ytp-caption-segment')?.parentElement ?? null;
  if (container !== captionContainer) {
    captionObserver.disconnect(); captionContainer = container;
    if (container) captionObserver.observe(container, { childList: true, characterData: true, subtree: true });
    scheduleTick();
  }
}
document.addEventListener('loadedmetadata', () => { bindDom(); scheduleTick(); }, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(scheduled); scheduled = undefined; due = Infinity; run.controller.abort(); }
  else void safely(async () => { await restart(); scheduleTick(); });
});
document.addEventListener('pointerdown', event => {
  if (panel && !panel.hidden && host && !event.composedPath().includes(host)) setPanel(false);
}, true);
window.addEventListener('pagehide', () => { run.controller.abort(); clearTimeout(scheduled); captionObserver.disconnect(); playerObserver.disconnect(); bootstrapObserver.disconnect(); videoEvents?.abort(); observedVideo = null; });
window.addEventListener('pageshow', event => { if (event.persisted) void safely(async () => { await restart(); bindDom(); scheduleTick(); }); });
void safely(async () => { await restart(); bindDom(); mount(); scheduleTick(); });
