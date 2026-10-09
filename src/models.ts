export const MODEL_ROOT = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/';
export const MODELS = {
  general: { name: 'PP-OCRv5_mobile_rec', label: '通用 · 中 / 英 / 日', bundled: true },
  korean: { name: 'korean_PP-OCRv5_mobile_rec', label: '韩语', bundled: false },
  latin: { name: 'latin_PP-OCRv5_mobile_rec', label: '拉丁文字 · 西 / 法 / 德等', bundled: true },
  devanagari: { name: 'devanagari_PP-OCRv5_mobile_rec', label: '天城文 · 印地语等', bundled: true },
  arabic: { name: 'arabic_PP-OCRv5_mobile_rec', label: '阿拉伯文字', bundled: true },
  cyrillic: { name: 'cyrillic_PP-OCRv5_mobile_rec', label: '西里尔文字 · 俄语等', bundled: false },
  thai: { name: 'thai_PP-OCRv5_mobile_rec', label: '泰语', bundled: false },
  greek: { name: 'greek_PP-OCRv5_mobile_rec', label: '希腊语', bundled: false },
  tamil: { name: 'tamil_PP-OCRv5_mobile_rec', label: '泰米尔语', bundled: false },
  telugu: { name: 'telugu_PP-OCRv5_mobile_rec', label: '泰卢固语', bundled: false },
} as const;
export type Profile = keyof typeof MODELS;
export function isProfile(value: unknown): value is Profile {
  return typeof value === 'string' && Object.hasOwn(MODELS, value);
}
export function profileForLanguage(lang: string): Profile {
  const code = lang.toLowerCase().split('-')[0];
  if (['zh', 'ja', 'en'].includes(code)) return 'general';
  if (code === 'ko') return 'korean';
  if (['ar', 'fa', 'ur'].includes(code)) return 'arabic';
  if (['hi', 'mr', 'ne'].includes(code)) return 'devanagari';
  if (['ru', 'uk', 'bg', 'be', 'mk', 'sr'].includes(code)) return 'cyrillic';
  if (code === 'th') return 'thai';
  if (code === 'el') return 'greek';
  if (code === 'ta') return 'tamil';
  if (code === 'te') return 'telugu';
  return 'latin';
}
