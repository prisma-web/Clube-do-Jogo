const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{6,15}$/;

export function youtubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return id || null;
  }
  if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/')[2] || null;
  if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || null;
  return parsed.searchParams.get('v');
}

export function isAllowedYoutubeOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function youtubeEmbedUrl(url?: string | null): string | null {
  const id = youtubeVideoId(url);
  if (!id || !VIDEO_ID_PATTERN.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1&controls=1`;
}

export function youtubeEmbedderOrigin(siteOrigin: string | null | undefined, applicationId: string | null | undefined): string {
  if (siteOrigin) {
    try {
      const parsed = new URL(siteOrigin);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.origin;
    } catch {
    }
  }
  const id = (applicationId || '').toLowerCase();
  return /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(id) ? `https://${id}` : 'https://clubedojogo.app';
}

export const PAUSE_PLAYER_SCRIPT = 'window.clubeTrailerPause && window.clubeTrailerPause(); true;';

const PLAYER_BRIDGE = `(function () {
  var frame = document.getElementById('player');
  var origin = new URL(frame.src).origin;
  var last = null;
  function post(message) {
    if (frame.contentWindow) frame.contentWindow.postMessage(JSON.stringify(message), origin);
  }
  function command(func, args) {
    post({ event: 'command', func: func, args: args, id: 'player', channel: 'widget' });
  }
  frame.addEventListener('load', function () {
    post({ event: 'listening', id: 'player', channel: 'widget' });
    command('addEventListener', ['onStateChange']);
  });
  window.addEventListener('message', function (event) {
    if (event.origin !== origin || event.source !== frame.contentWindow || typeof event.data !== 'string') return;
    var data;
    try { data = JSON.parse(event.data); } catch (error) { return; }
    var state = !data ? null
      : data.event === 'onStateChange' ? data.info
      : data.event === 'infoDelivery' && data.info ? data.info.playerState
      : null;
    if (typeof state !== 'number' || state === last || !window.ReactNativeWebView) return;
    last = state;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'youtube-state', state: state }));
  });
  window.clubeTrailerPause = function () { command('pauseVideo', []); };
})();`;

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function youtubePlayerSource(embedUrl: string | null | undefined, embedderOrigin: string, options: { autoplay?: boolean } = {}): { html: string; baseUrl: string } | null {
  if (!embedUrl || !isAllowedYoutubeOrigin(embedUrl)) return null;
  const src = new URL(embedUrl);
  if (options.autoplay) src.searchParams.set('autoplay', '1');
  src.searchParams.set('origin', embedderOrigin);
  src.searchParams.set('enablejsapi', '1');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">'
    + '<meta name="referrer" content="strict-origin-when-cross-origin">'
    + '<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style>'
    + '</head><body>'
    + `<iframe id="player" src="${escapeHtmlAttribute(src.toString())}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
    + `<script>${PLAYER_BRIDGE}</script>`
    + '</body></html>';
  return { html, baseUrl: `${embedderOrigin}/` };
}

export function isAllowedPlayerNavigation(url: string, embedderOrigin: string): boolean {
  if (url === 'about:blank' || url === 'about:srcdoc') return true;
  if (url === embedderOrigin || url === `${embedderOrigin}/`) return true;
  return isAllowedYoutubeOrigin(url);
}
