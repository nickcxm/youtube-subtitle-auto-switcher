import { DEFAULTS, getSettings, messageError } from './shared';
let opening: Promise<void> | undefined;
let mutations: Promise<void> = Promise.resolve();
async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const previous = mutations;
  let unlock!: () => void;
  mutations = new Promise<void>(resolve => { unlock = resolve; });
  await previous;
  try { return await operation(); } finally { unlock(); }
}
async function ensureIdleAlarm() {
  if (!await chrome.alarms.get('release-local-ocr')) await chrome.alarms.create('release-local-ocr', { delayInMinutes: 5 });
}
async function offscreen() {
  if (!opening) opening = openDocument();
  return opening;
}
async function openDocument() {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
    if (!contexts.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.WORKERS], justification: 'Run local OCR on video frames without uploading them.' });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { const ready = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PING' }); if (ready?.ok) return; } catch { /* The HTML may load before its bundled module. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('本地 OCR 页面未就绪，请重新加载扩展');
  } finally { opening = undefined; }
}
async function dispatch(m: Record<string, any>, sender: chrome.runtime.MessageSender) {
  switch (m.type) {
    case 'JOB_SUBMIT': case 'JOB_POLL': case 'JOB_CANCEL': case 'MODELS': {
      if (m.type === 'JOB_SUBMIT' && !['OCR', 'DOWNLOAD', 'CLEAR_MODELS'].includes(m.operation)) throw new Error('无效任务');
      const owner = sender.documentId ?? `${sender.tab?.id ?? 'extension'}:${sender.frameId ?? 0}:${sender.url ?? ''}`;
      await offscreen();
      if (m.type === 'JOB_SUBMIT') await ensureIdleAlarm();
      const response = await chrome.runtime.sendMessage({ ...m, target: 'offscreen', owner });
      if (!response?.ok) throw new Error(response?.error || '本地任务页面没有响应');
      return response.data;
    }
    case 'OPEN_SETTINGS': {
      const target = sender.tab;
      if (target?.id !== undefined && target.url?.startsWith('https://www.youtube.com/watch')) {
        await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?tabId=${target.id}`) });
      } else await chrome.runtime.openOptionsPage();
      return true;
    }
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
  void (async () => {
    try { const data = write ? await mutate(() => dispatch(message, sender)) : await dispatch(message, sender); respond({ ok: true, data }); }
    catch (error) { respond({ ok: false, error: messageError(error) }); }
  })();
  return true;
});
chrome.runtime.onInstalled.addListener(async () => {
  if (!(await chrome.storage.local.get('settings')).settings) await chrome.storage.local.set({ settings: DEFAULTS });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'release-local-ocr') return;
  void (async () => {
    try {
      const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
      if (contexts.length) {
        const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'RELEASE_IDLE' });
        if (!response?.data?.released) await chrome.alarms.create('release-local-ocr', { delayInMinutes: 1 });
      }
    } catch { /* A page may have closed while the alarm was being delivered. */ }
  })();
});
chrome.runtime.onStartup.addListener(() => { void (async () => { try { await ensureIdleAlarm(); } catch { /* Browser shutting down. */ } })(); });
