// Minimal page-world metadata bridge. No fetch/XHR interception or recurring polling.
const SCOPE = 'local-captions:metadata:v1';
type Player = HTMLElement & { getPlayerResponse?: () => any; getOption?: (a: string, b: string) => any };
let watched: Player | null = null;
function publish() {
  const id = new URL(location.href).searchParams.get('v') ?? '';
  const player = document.getElementById('movie_player') as Player | null;
  try {
    const response = player?.getPlayerResponse?.() ?? (window as any).ytInitialPlayerResponse;
    if (response?.videoDetails?.videoId !== id) return;
    const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const selected = player?.getOption?.('captions', 'track');
    const current = tracks.find((t: any) => selected?.vssId ? t.vssId === selected.vssId : selected?.languageCode && t.languageCode === selected.languageCode) ?? (tracks.length === 1 ? tracks[0] : null);
    const translation = selected?.translationLanguage?.languageCode ?? '';
    const audio = response.videoDetails.defaultAudioLanguage ?? tracks.find((t: any) => t.kind === 'asr')?.languageCode ?? '';
    window.postMessage({ scope: SCOPE, type: 'response', videoId: id,
      channelId: response.videoDetails.channelId ?? '', channelName: response.videoDetails.author ?? '',
      available: tracks.length > 0, language: translation || current?.languageCode || '', audio,
      track: current ? `${current.vssId ?? current.languageCode}:${translation}` : '',
    }, location.origin);
  } catch { /* Visible captions remain usable if metadata is not ready. */ }
}
function bindPlayer() {
  const player = document.getElementById('movie_player') as Player | null;
  if (player && player !== watched && typeof player.getPlayerResponse === 'function') {
    watched?.removeEventListener('onCaptionsTrackListChanged', publish);
    watched = player; player.addEventListener('onCaptionsTrackListChanged', publish); bootstrap.disconnect();
  }
  publish();
}
const bootstrap = new MutationObserver(bindPlayer);
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.scope !== SCOPE || event.data?.type !== 'request') return;
  bindPlayer();
});
document.addEventListener('loadedmetadata', bindPlayer, true);
document.addEventListener('DOMContentLoaded', bindPlayer, { once: true });
document.addEventListener('yt-navigate-finish', () => { bootstrap.observe(document.documentElement, { childList: true, subtree: true }); bindPlayer(); });
if (document.documentElement) bootstrap.observe(document.documentElement, { childList: true, subtree: true });
