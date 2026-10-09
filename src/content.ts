import { Evidence, normalize } from './decision';
import { profileForLanguage, type Profile } from './models';
import { DEFAULTS, effectiveRule, getSettings, request, messageError, type Settings, type Status, type OcrResult, type Rule } from './shared';
const SCOPE = 'local-captions:metadata:v1';
type Metadata = { videoId: string; channelId: string; channelName: string; track: string; audio: string; language: string; available: boolean };
type Run = { id: number; busy: boolean; seen: Set<string>; evidence: Evidence; samples: number; errors: number; done: boolean; lastTime: number };
let settings: Settings = DEFAULTS;
let metadata: Metadata = { videoId: '', channelId: '', channelName: '', track: '', audio: '', language: '', available: false };
let videoId = '', generation = 0, manual = false, closed = false, state = '等待 YouTube 视频';
let run: Run = makeRun();
let host: HTMLElement | undefined, root: ShadowRoot | undefined, panel: HTMLElement | undefined;
let lastMetadata = 0, observedVideo: HTMLVideoElement | null = null;
function makeRun(): Run { return { id: ++generation, busy: false, seen: new Set(), evidence: new Evidence(), samples: 0, errors: 0, done: false, lastTime: -10 }; }
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
    if (select && document.activeElement !== host) select.value = (kind === 'video' ? settings.videoRules[videoId] : settings.channelRules[metadata.channelId]) ?? 'inherit';
    if (select) select.disabled = kind === 'video' ? !videoId : !metadata.channelId;
  }
}
async function restart(preserveManual = true, force = false) {
  const id = currentId(), previous = videoId;
  if (id !== previous) { manual = false; closed = false; metadata = { videoId: id, channelId: '', channelName: '', track: '', audio: '', language: '', available: false }; }
  if (!preserveManual) manual = false;
  videoId = id; run = makeRun(); const selected = run;
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
  manual = true; closed = false; run = makeRun(); run.done = true; update('本次播放由你控制'); log('manual-override');
  // A user correction invalidates a remembered closure immediately.
  if (metadata.track) void request('CACHE_PUT', { key: cacheKey(), remove: true }).catch(() => undefined);
}
async function restore() {
  if (!setCC(true)) { update('当前无法恢复，请使用 YouTube CC'); return; }
  manual = true; closed = false; run = makeRun(); run.done = true;
  if (metadata.track) await request('CACHE_PUT', { key: cacheKey(), remove: true });
  update('已恢复，本次播放由你控制'); log('undo');
}
async function recheck() {
  closed = false; setCC(true); await restart(false, true); update('重新检测中');
}
function mount() {
  if (host?.isConnected) return;
  const controls = document.querySelector('.ytp-right-controls'); if (!controls) return;
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
  </style><button id="toggle" aria-label="本地字幕管家" aria-expanded="false" title="本地字幕管家">LC</button>
  <section id="panel" hidden><h3>本地字幕管家</h3><p id="state"></p><p id="info"></p>
    <div class="actions"><button id="recheck">重新检测</button><button id="restore" hidden>恢复软字幕</button><button id="settings">设置</button></div>
    <label>当前视频<select id="video"><option value="inherit">继承频道 / 全局</option><option value="show">始终开启软字幕</option><option value="hide">始终关闭软字幕</option></select></label>
    <label>当前频道<select id="channel"><option value="inherit">继承全局设置</option><option value="show">始终开启软字幕</option><option value="hide">始终关闭软字幕</option></select></label>
    <small>视频规则优先于频道规则。手动 CC 只影响本次播放。画面留在本机。</small></section>`;
  controls.prepend(host); panel = root.querySelector<HTMLElement>('#panel')!;
  root.querySelector('#toggle')!.addEventListener('click', () => { panel!.hidden = !panel!.hidden; root!.querySelector('#toggle')!.setAttribute('aria-expanded', String(!panel!.hidden)); update(state); });
  root.querySelector('#recheck')!.addEventListener('click', () => void recheck());
  root.querySelector('#restore')!.addEventListener('click', () => void restore());
  root.querySelector('#settings')!.addEventListener('click', () => void chrome.runtime.sendMessage({ target: 'background', type: 'OPEN_SETTINGS' }));
  for (const kind of ['video', 'channel'] as const) root.querySelector(`#${kind}`)!.addEventListener('change', async event => {
    const id = kind === 'video' ? videoId : metadata.channelId;
    if (!id) return;
    try { await request('RULE', { kind, id, rule: (event.target as HTMLSelectElement).value }); closed = false; await restart(false, true); }
    catch (error) { update(messageError(error)); }
  });
  root.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Escape') panel!.hidden = true; });
  update(state);
}
function frame(video: HTMLVideoElement) {
  const width = Math.min(960, video.videoWidth), sourceHeight = Math.round(video.videoHeight * settings.crop);
  const height = Math.max(1, Math.round(sourceHeight * width / video.videoWidth));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 不可用');
  context.drawImage(video, 0, video.videoHeight - sourceHeight, video.videoWidth, sourceHeight, 0, 0, width, height);
  return { image: canvas.toDataURL('image/jpeg', 0.85), width, height };
}
async function tick() {
  mount();
  if (currentId() !== videoId) { await restart(); return; }
  if (!videoId) return;
  if (performance.now() - lastMetadata > 1500) { lastMetadata = performance.now(); window.postMessage({ scope: SCOPE, type: 'request' }, location.origin); }
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video, video');
  if (video !== observedVideo && video) {
    observedVideo = video;
    video.addEventListener('seeking', () => { void restart(); });
  }
  if (manual || document.hidden || document.querySelector('#movie_player.ad-showing') || !video || video.paused || video.seeking || video.readyState < 2) return;
  const rule = effectiveRule(settings, videoId, metadata.channelId);
  if (rule !== 'inherit') { if (setCC(rule === 'show')) update(`已应用规则：${rule === 'show' ? '开启' : '关闭'}软字幕`); return; }
  if (closed) return;
  if (settings.autoOpen && !enabled() && metadata.available) setCC(true);
  const selected = run;
  if (!settings.dedupe || selected.done || selected.busy || !enabled()) return;
  const text = softText(), key = normalize(text);
  if (key.length < 4 || selected.seen.has(key) || video.currentTime - selected.lastTime < 1.5) return;
  if (selected.samples >= settings.maxSamples) { selected.done = true; update('证据不足，保留软字幕'); return; }
  selected.busy = true; selected.lastTime = video.currentTime;
  try {
    const captured = frame(video), capturedTrack = metadata.track, capturedId = videoId;
    selected.seen.add(key); selected.samples++; update('本地识别中…');
    const language = metadata.audio || metadata.language || navigator.language;
    const profile: Profile = settings.model === 'auto' ? profileForLanguage(language) : settings.model;
    const result = await request<OcrResult>('OCR', { ...captured, profile, backend: settings.backend });
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
        update('画面可能有不同语言的字幕'); panel!.hidden = false;
        const existing = root!.querySelector('#close-other'); existing?.remove();
        const button = document.createElement('button'); button.id = 'close-other'; button.textContent = '关闭软字幕';
        button.addEventListener('click', () => { if (selected !== run) { button.remove(); return; } if (setCC(false)) { closed = true; update('已关闭，可随时恢复'); } button.remove(); });
        root!.querySelector('.actions')!.append(button);
      } else update('可能有不同语言的硬字幕，保留软字幕');
    } else update(selected.samples >= settings.maxSamples ? '证据不足，保留软字幕' : '等待下一段字幕验证');
  } catch (error) {
    if (selected !== run) return;
    selected.errors++; log('ocr-error', 'local-runtime-failed');
    update(`识别未完成：${messageError(error).slice(0, 110)}`);
    if (selected.errors >= 2) selected.done = true;
  } finally { selected.busy = false; }
}
window.addEventListener('message', event => {
  const m = event.data;
  if (event.source !== window || event.origin !== location.origin || m?.scope !== SCOPE || m.type !== 'response' || m.videoId !== videoId) return;
  if (!['channelId', 'channelName', 'track', 'audio', 'language'].every(key => typeof m[key] === 'string' && m[key].length < 200)) return;
  if (!m.track && !enabled()) { m.track = metadata.track; m.language = metadata.language; }
  const changed = m.track !== metadata.track || m.channelId !== metadata.channelId;
  metadata = m;
  if (changed) { closed = false; void restart(); }
});
document.addEventListener('click', event => {
  if (event.isTrusted && event.target instanceof Element && (event.target.closest('.ytp-subtitles-button') || event.target.closest('.ytp-settings-menu [role="menuitemradio"]'))) userOverride();
}, true);
document.addEventListener('keydown', event => {
  if (!event.isTrusted || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'c') return;
  if (event.composedPath().some(node => node instanceof Element && node.matches('input,textarea,select,[contenteditable="true"],[role="textbox"]'))) return;
  userOverride();
}, true);
document.addEventListener('yt-navigate-start', () => { run = makeRun(); run.done = true; });
document.addEventListener('yt-navigate-finish', () => void restart());
chrome.storage.onChanged.addListener(changes => { if (changes.settings) void restart(); });
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target !== 'content') return;
  if (message.type === 'STATUS') { respond({ ok: true, data: status() }); return; }
  const job = message.type === 'RECHECK' ? recheck() : message.type === 'RESTORE' ? restore() : Promise.reject(new Error('未知操作'));
  job.then(() => respond({ ok: true, data: status() }), error => respond({ ok: false, error: messageError(error) })); return true;
});
void restart();
setInterval(() => { void tick().catch(error => update(messageError(error))); }, 500);
