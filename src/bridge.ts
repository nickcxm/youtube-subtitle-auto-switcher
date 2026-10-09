// A minimal page-world bridge. No fetch/XHR interception or subtitle downloads.
const SCOPE = 'local-captions:metadata:v1';
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.scope !== SCOPE || event.data?.type !== 'request') return;
  const id = new URL(location.href).searchParams.get('v') ?? '';
  const player = document.getElementById('movie_player') as (HTMLElement & { getPlayerResponse?: () => any; getOption?: (a: string, b: string) => any }) | null;
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
  } catch { /* Metadata is optional; visible subtitles remain usable. */ }
});
