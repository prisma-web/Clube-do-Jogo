import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import * as Application from 'expo-application';
import { WebView } from 'react-native-webview';
import { getMobileSiteUrl } from '@/platform/config';
import { isAllowedPlayerNavigation, youtubeEmbedderOrigin, youtubePlayerSource } from './youtube';

const ORIGIN_WHITELIST = ['*'];

export function YoutubePlayer({ embedUrl, title, autoplay, style }: {
  embedUrl: string;
  title: string;
  autoplay?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const embedderOrigin = useMemo(() => youtubeEmbedderOrigin(getMobileSiteUrl(), Application.applicationId), []);
  const source = useMemo(() => youtubePlayerSource(embedUrl, embedderOrigin, { autoplay }), [autoplay, embedUrl, embedderOrigin]);
  if (!source) return null;

  return (
    <WebView
      key={embedUrl}
      source={source}
      style={style}
      originWhitelist={ORIGIN_WHITELIST}
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
