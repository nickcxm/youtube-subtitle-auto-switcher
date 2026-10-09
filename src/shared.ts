import type { Profile } from './models';
export type Rule = 'inherit' | 'show' | 'hide';
export type Settings = {
  autoOpen: boolean; dedupe: boolean; differentLanguage: 'keep' | 'ask' | 'hide';
  model: Profile | 'auto'; backend: 'auto' | 'wasm'; crop: number; maxSamples: number;
  remember: boolean; channelRules: Record<string, Rule>; videoRules: Record<string, Rule>;
};
export const DEFAULTS: Settings = {
  autoOpen: true, dedupe: true, differentLanguage: 'keep', model: 'auto', backend: 'wasm',
  crop: 0.3, maxSamples: 6, remember: true, channelRules: {}, videoRules: {},
};
export type Line = { text: string; score: number; poly: [number, number][] };
export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
export type OcrResult = { lines: Line[]; duration: number; backend: string };
export type Status = { videoId: string; channelId: string; channelName: string; track: string; state: string; samples: number; manual: boolean; closed: boolean };
export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get<{ settings?: Partial<Settings> }>('settings');
  return { ...DEFAULTS, ...settings, channelRules: settings?.channelRules ?? {}, videoRules: settings?.videoRules ?? {} };
}
export function effectiveRule(s: Settings, videoId: string, channelId: string): Rule {
  const video = s.videoRules[videoId];
  if (video && video !== 'inherit') return video;
  const channel = s.channelRules[channelId];
  return channel && channel !== 'inherit' ? channel : 'inherit';
}
export async function request<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const reply: Reply<T> = await chrome.runtime.sendMessage({ target: 'background', type, ...payload });
  if (!reply?.ok) throw new Error(reply?.error ?? '扩展暂时不可用，请刷新页面后重试');
  return reply.data;
}
export function messageError(error: unknown): string { return error instanceof Error ? error.message : String(error); }
