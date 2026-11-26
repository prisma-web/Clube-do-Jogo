import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Application from 'expo-application';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { getMobileSiteUrl } from '@/platform/config';
import { parseTrailerPlayerMessage, type YoutubePlayerState } from './floating-trailer';
import { isAllowedPlayerNavigation, PAUSE_PLAYER_SCRIPT, youtubeEmbedderOrigin, youtubePlayerSource } from './youtube';

const ORIGIN_WHITELIST = ['*'];

export type YoutubePlayerHandle = { pause: () => void };

export function YoutubePlayer({ embedUrl, title, autoplay, style, onPlayerState, ref }: {
  embedUrl: string;
  title: string;
  autoplay?: boolean;
  style?: StyleProp<ViewStyle>;
  onPlayerState?: (state: YoutubePlayerState) => void;
  ref?: Ref<YoutubePlayerHandle>;
}) {
  const webViewRef = useRef<WebView>(null);
  const embedderOrigin = useMemo(() => youtubeEmbedderOrigin(getMobileSiteUrl(), Application.applicationId), []);
  const source = useMemo(() => youtubePlayerSource(embedUrl, embedderOrigin, { autoplay }), [autoplay, embedUrl, embedderOrigin]);
  useImperativeHandle(ref, () => ({ pause: () => webViewRef.current?.injectJavaScript(PAUSE_PLAYER_SCRIPT) }), []);
  if (!source) return null;

  function handleMessage(event: WebViewMessageEvent) {
    const state = parseTrailerPlayerMessage(event.nativeEvent.data);
    if (state !== null) onPlayerState?.(state);
  }

  return (
    <WebView
      ref={webViewRef}
      key={embedUrl}
      source={source}
      style={style}
      originWhitelist={ORIGIN_WHITELIST}
      onMessage={onPlayerState ? handleMessage : undefined}
      onShouldStartLoadWithRequest={request => isAllowedPlayerNavigation(request.url, embedderOrigin)}
      javaScriptEnabled
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      incognito
      domStorageEnabled={false}
      cacheEnabled={false}
      setSupportMultipleWindows={false}
      accessibilityLabel={`Trailer de ${title}`}
    />
  );
}
