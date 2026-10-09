import { DEFAULTS, getSettings, messageError } from './shared';
import { isProfile } from './models';
let opening: Promise<void> | undefined;
let mutations: Promise<unknown> = Promise.resolve();
async function offscreen() {
  if (!opening) opening = (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.WORKERS], justification: 'Run local OCR on video frames without uploading them.' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { const ready = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PING' }); if (ready?.ok) return; } catch { /* The HTML may load before its bundled module. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('本地 OCR 页面未就绪，请重新加载扩展');
  })().finally(() => { opening = undefined; });
  return opening;
}
async function dispatch(m: Record<string, any>, sender: chrome.runtime.MessageSender) {
  switch (m.type) {
    case 'OCR': case 'MODELS': case 'DOWNLOAD': case 'CLEAR_MODELS':
      if (m.type === 'OCR' && (!isProfile(m.profile) || typeof m.image !== 'string' || m.image.length > 2000000)) throw new Error('无效识别请求');
      await offscreen();
      let timer: ReturnType<typeof setTimeout> | undefined, timedOut = false;
      const response = await Promise.race([
        chrome.runtime.sendMessage({ ...m, target: 'offscreen' }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('本地处理超时，请稍后重试或选择 WASM 兼容模式')); }, m.type === 'OCR' ? 90000 : 200000); }),
      ]).catch(async error => {
        if (timedOut && m.type === 'OCR') { try { await chrome.offscreen.closeDocument(); } catch { /* already closed */ } }
        throw error;
      }).finally(() => clearTimeout(timer));
      if (!response?.ok) throw new Error(response?.error || 'OCR 页面没有响应');
      return response.data;
    case 'OPEN_SETTINGS': await chrome.runtime.openOptionsPage(); return true;
    case 'SETTINGS': return getSettings();
    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      const patch = m.patch ?? {};
      const next = { ...current };
      for (const key of ['autoOpen', 'dedupe', 'remember'] as const) if (typeof patch[key] === 'boolean') next[key] = patch[key];
      if (['keep', 'ask', 'hide'].includes(patch.differentLanguage)) next.differentLanguage = patch.differentLanguage;
      if (patch.model === 'auto' || isProfile(patch.model)) next.model = patch.model;
      if (['auto', 'wasm'].includes(patch.backend)) next.backend = patch.backend;
      if (Number.isFinite(patch.crop)) next.crop = Math.max(0.15, Math.min(0.6, patch.crop));
      if (Number.isFinite(patch.maxSamples)) next.maxSamples = Math.round(Math.max(2, Math.min(12, patch.maxSamples)));
      await chrome.storage.local.set({ settings: next }); return next;
    }
    case 'RULE': {
      if (!['video', 'channel'].includes(m.kind) || typeof m.id !== 'string' || !m.id || m.id.length > 200 || !['inherit', 'show', 'hide'].includes(m.rule)) throw new Error('无效规则');
      const settings = await getSettings(), rules = m.kind === 'video' ? settings.videoRules : settings.channelRules;
      if (m.rule === 'inherit') delete rules[m.id]; else rules[m.id] = m.rule;
      await chrome.storage.local.set({ settings }); return settings;
    }
    case 'CACHE_GET': return (await chrome.storage.local.get<{confirmed?: Record<string, number>}>('confirmed')).confirmed?.[m.key] ?? null;
    case 'CACHE_PUT': {
      if (typeof m.key !== 'string' || m.key.length > 400) throw new Error('无效缓存键');
      const { confirmed = {} } = await chrome.storage.local.get<{confirmed?: Record<string, number>}>('confirmed');
      if (m.remove) delete confirmed[m.key]; else confirmed[m.key] = Date.now();
      const entries = Object.entries(confirmed).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 500);
      await chrome.storage.local.set({ confirmed: Object.fromEntries(entries) }); return true;
    }
    case 'CLEAR_CACHE': await chrome.storage.local.remove('confirmed'); return true;
    case 'LOG': {
      const { logs = [] } = await chrome.storage.local.get<{logs?: {at: number; video: string; event: string; detail: string}[]}>('logs');
      // Fixed fields only: no image, OCR text, subtitle text or arbitrary page content.
      logs.push({ at: Date.now(), video: String(m.video ?? '').slice(0, 20), event: String(m.event ?? '').slice(0, 80), detail: String(m.detail ?? '').slice(0, 160) });
      await chrome.storage.local.set({ logs: logs.slice(-200) }); return true;
    }
    case 'LOGS': return (await chrome.storage.local.get<{logs?: {at: number; video: string; event: string; detail: string}[]}>('logs')).logs ?? [];
    case 'CLEAR_LOGS': await chrome.storage.local.remove('logs'); return true;
    default: throw new Error('未知请求');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'background' || sender.id !== chrome.runtime.id) return;
  // Serialize storage writes only; model requests must not block settings or undo.
  const write = ['SAVE_SETTINGS', 'RULE', 'CACHE_PUT', 'CLEAR_CACHE', 'LOG', 'CLEAR_LOGS'].includes(message.type);
  const job = write ? mutations.then(() => dispatch(message, sender)) : dispatch(message, sender);
  if (write) mutations = job.catch(() => undefined);
  job.then(data => respond({ ok: true, data }), error => respond({ ok: false, error: messageError(error) }));
  return true;
});
chrome.runtime.onInstalled.addListener(async () => {
  if (!(await chrome.storage.local.get('settings')).settings) await chrome.storage.local.set({ settings: DEFAULTS });
});
