import { MODELS, type Profile } from './models';
import { getSettings, request, messageError, type Settings, type Status, type OcrResult, type Reply } from './shared';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let tabId: number | undefined;
function notice(text: string) { $('notice').textContent = text; }
async function withNotice(job: () => Promise<unknown>) { try { await job(); } catch (error) { notice(messageError(error)); } }
async function content(type: string): Promise<Status> {
  if (tabId === undefined) throw new Error('请先打开 YouTube 视频页面');
  const response: Reply<Status> = await chrome.tabs.sendMessage(tabId, { target: 'content', type });
  if (!response?.ok) throw new Error(response?.error ?? '请刷新 YouTube 页面后重试');
  return response.data;
}
function showSettings(s: Settings) {
  for (const key of ['autoOpen', 'dedupe', 'remember'] as const) $<HTMLInputElement>(key).checked = s[key];
  for (const key of ['differentLanguage', 'model', 'backend', 'crop', 'maxSamples'] as const) $<HTMLSelectElement>(key).value = String(s[key]);
  $('rules').replaceChildren();
  for (const [kind, rules] of [['video', s.videoRules], ['channel', s.channelRules]] as const) {
    for (const [id, rule] of Object.entries(rules)) {
      const row = document.createElement('div'); row.className = 'rule-row';
      const text = document.createElement('span'); text.textContent = `${kind === 'video' ? '视频' : '频道'} ${id} · ${rule === 'show' ? '开启' : '关闭'}`;
      const button = document.createElement('button'); button.textContent = '删除';
      button.addEventListener('click', () => void withNotice(async () => { showSettings(await request<Settings>('RULE', { kind, id, rule: 'inherit' })); notice('规则已删除'); }));
      row.append(text, button); $('rules').append(row);
    }
  }
  if (!$('rules').children.length) $('rules').textContent = '暂无规则';
}
type ModelState = { id: Profile; label: string; state: 'bundled' | 'cached' | 'missing'; size: number };
function showModels(models: ModelState[]) {
  $('models').replaceChildren();
  for (const model of models) {
    const row = document.createElement('div'); row.className = 'model-row';
    const label = document.createElement('span'); label.textContent = model.label;
    const state = document.createElement('small'); state.textContent = model.state === 'bundled' ? '内置' : model.state === 'cached' ? `${(model.size / 1048576).toFixed(1)} MB` : '未下载';
    row.append(label, state);
    if (model.state === 'missing') {
      const button = document.createElement('button'); button.textContent = '下载';
      button.addEventListener('click', () => void withNotice(async () => {
        button.disabled = true; button.textContent = '下载中…';
        try { showModels(await request<ModelState[]>('DOWNLOAD', { profile: model.id })); notice('模型已保存到本机'); }
        finally { button.disabled = false; button.textContent = '下载'; }
      })); row.append(button);
    }
    $('models').append(row);
  }
}
for (const [id, model] of Object.entries(MODELS)) { const option = document.createElement('option'); option.value = id; option.textContent = model.label; $('model').append(option); }
for (const key of ['autoOpen', 'dedupe', 'remember', 'differentLanguage', 'model', 'backend', 'crop', 'maxSamples'] as const) {
  $(key).addEventListener('change', () => void withNotice(async () => {
    const element = $(key) as HTMLInputElement;
    const value = element.type === 'checkbox' ? element.checked : ['crop', 'maxSamples'].includes(key) ? Number(element.value) : element.value;
    await request('SAVE_SETTINGS', { patch: { [key]: value } }); notice('设置已保存');
  }));
}
$('recheck').addEventListener('click', () => void withNotice(async () => { const s = await content('RECHECK'); $('status').textContent = s.state; }));
$('restore').addEventListener('click', () => void withNotice(async () => { const s = await content('RESTORE'); $('status').textContent = s.state; }));
$('loadModels').addEventListener('click', () => void withNotice(async () => { showModels(await request<ModelState[]>('MODELS')); }));
$('clearModels').addEventListener('click', () => void withNotice(async () => { showModels(await request<ModelState[]>('CLEAR_MODELS')); notice('已清除下载模型，内置模型保留'); }));
$('clearCache').addEventListener('click', () => void withNotice(async () => { await request('CLEAR_CACHE'); notice('已清除确认记录'); }));
$('clearLogs').addEventListener('click', () => void withNotice(async () => { await request('CLEAR_LOGS'); notice('日志已清除'); }));
$('exportLogs').addEventListener('click', () => void withNotice(async () => {
  const logs = await request('LOGS');
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: '0.1.0', logs }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'local-captions-logs.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
$('testOcr').addEventListener('click', () => void withNotice(async () => {
  const file = $<HTMLInputElement>('testImage').files?.[0]; if (!file) throw new Error('请先选择图片');
  if (file.size > 10 * 1048576) throw new Error('请选择小于 10 MB 的图片');
  const button = $<HTMLButtonElement>('testOcr'); button.disabled = true; $('ocrResult').textContent = '加载本地模型并识别…';
  try {
    const bitmap = await createImageBitmap(file), scale = Math.min(1, 960 / bitmap.width, 960 / bitmap.height);
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const s = await getSettings();
    const result = await request<OcrResult>('OCR', { image: canvas.toDataURL('image/jpeg', 0.9), profile: s.model === 'auto' ? 'general' : s.model, backend: s.backend });
    $('ocrResult').textContent = `${Math.round(result.duration)} ms · ${result.backend}\n\n${result.lines.map(l => l.text).join('\n') || '没有识别到文字'}`;
    notice('识别完成，图片未保存');
  } catch (error) { $('ocrResult').textContent = messageError(error); throw error; }
  finally { button.disabled = false; }
}));
void withNotice(async () => {
  showSettings(await getSettings());
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = active?.id;
  if (active?.url?.startsWith('https://www.youtube.com/watch')) {
    try { const s = await content('STATUS'); $('status').textContent = `${s.state} · ${s.samples} 次取样`; }
    catch { $('status').textContent = '请刷新已打开的 YouTube 页面'; }
  } else $('status').textContent = '打开 YouTube 视频开始使用';
});
