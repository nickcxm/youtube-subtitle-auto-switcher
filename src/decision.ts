import { Converter } from 'opencc-js/t2cn';
import type { Line } from './shared';
const simplified = Converter({ from: 'tw', to: 'cn' });
export function normalize(text: string): string {
  let value = text.normalize('NFKC').toLowerCase();
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) value = simplified(value);
  return value.replace(/[\p{P}\p{S}\p{Cf}\s]/gu, '');
}
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]));
    previous = next;
  }
  return previous[b.length];
}
export function similarity(hard: string, soft: string): number {
  const a = normalize(hard).slice(0, 300), b = normalize(soft).slice(0, 300);
  if (Math.min(a.length, b.length) < 4) return 0;
  const shorter = a.length < b.length ? a : b, longer = a.length < b.length ? b : a;
  if (shorter.length >= 6 && longer.includes(shorter) && shorter.length / longer.length >= 0.65) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}
export function script(text: string): string {
  const scripts: [string, RegExp][] = [
    ['ja', /[\p{Script=Hiragana}\p{Script=Katakana}]/gu], ['ko', /\p{Script=Hangul}/gu],
    ['han', /\p{Script=Han}/gu], ['latin', /\p{Script=Latin}/gu], ['arabic', /\p{Script=Arabic}/gu],
    ['cyrillic', /\p{Script=Cyrillic}/gu], ['devanagari', /\p{Script=Devanagari}/gu],
    ['thai', /\p{Script=Thai}/gu], ['greek', /\p{Script=Greek}/gu], ['tamil', /\p{Script=Tamil}/gu], ['telugu', /\p{Script=Telugu}/gu],
  ];
  if ((text.match(scripts[0][1])?.length ?? 0) >= 2) return 'ja';
  const counts = scripts.map(([name, pattern]) => ({ name, count: text.match(pattern)?.length ?? 0 })).sort((a, b) => b.count - a.count);
  return counts[0].count >= 3 ? counts[0].name : 'unknown';
}
export function candidateLines(lines: Line[], width: number, height: number): Line[] {
  return lines.filter(line => {
    if (line.score < 0.72 || normalize(line.text).length < 4 || line.poly.length < 4) return false;
    const xs = line.poly.map(p => p[0]), ys = line.poly.map(p => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const center = (Math.max(...xs) + Math.min(...xs)) / (2 * width);
    return w / width >= 0.06 && h >= 8 && h / height < 0.55 && center > 0.15 && center < 0.85;
  }).sort((a, b) => Math.abs(a.poly[0][1] - b.poly[0][1]) < 12 ? a.poly[0][0] - b.poly[0][0] : a.poly[0][1] - b.poly[0][1]);
}
export class Evidence {
  private duplicate = new Set<string>();
  private other = new Set<string>();
  private softOther = new Set<string>();
  private centers: number[] = [];
  add(lines: Line[], soft: string, width: number, height: number): 'duplicate' | 'different' | null {
    const candidates = candidateLines(lines, width, height).slice(0, 8);
    const softKey = normalize(soft);
    // Compare contiguous line groups so a watermark cannot dilute a matching subtitle.
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j <= candidates.length; j++) {
        const text = candidates.slice(i, j).map(l => l.text).join(' ');
        if (similarity(text, soft) >= 0.78) this.duplicate.add(softKey);
      }
    }
    if (this.duplicate.size >= 2) return 'duplicate';
    const strongest = candidates.filter(l => l.score >= 0.87 && normalize(l.text).length >= 6);
    if (strongest.length) {
      const text = strongest.map(l => l.text).join(' '), hardScript = script(text), softScript = script(soft);
      // Han/Japanese overlap is ambiguous; same alphabet languages are never classified here.
      if (hardScript !== 'unknown' && softScript !== 'unknown' && hardScript !== softScript && !(['han', 'ja'].includes(hardScript) && ['han', 'ja'].includes(softScript))) {
        this.other.add(normalize(text)); this.softOther.add(softKey);
        this.centers.push(strongest.reduce((sum, l) => sum + l.poly.reduce((n, p) => n + p[1], 0) / l.poly.length, 0) / strongest.length / height);
      }
    }
    if (this.other.size >= 3 && this.softOther.size >= 3 && Math.max(...this.centers) - Math.min(...this.centers) < 0.15) return 'different';
    return null;
  }
}
