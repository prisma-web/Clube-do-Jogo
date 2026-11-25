import { useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { themedStyles, useThemeColors, radii, spacing } from '@/theme';
import { isAllowedYoutubeOrigin, youtubeEmbedUrl } from './youtube';

const ORIGIN_WHITELIST = ['*'];

/**
 * Embedded trailer for the top of the game detail (parity with the web's
 * FloatingTrailer). The WebView only mounts after the user taps play, so opening
 * a game never loads YouTube on its own. `onExpand` hands playback over to the
 * fullscreen TrailerModal; `onMinimize` collapses the player back to the poster.
 */
export function InlineTrailer({ url, title, posterUrl, onExpand }: {
  url: string | null | undefined;
  title: string;
  posterUrl: string;
  onExpand: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const embedUrl = youtubeEmbedUrl(url);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') setPlaying(false);
    });
    return () => subscription.remove();
  }, [playing]);

  if (!embedUrl) return null;

  if (!playing) {
    return (
      <Pressable
        onPress={() => setPlaying(true)}
        accessibilityRole="button"
        accessibilityLabel={`Assistir trailer de ${title} aqui`}
        style={styles.frame}
      >
        <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
        <View style={styles.posterShade} />
        <View style={styles.playBadge}>
          <Ionicons name="play" size={22} color={colors.white} />
        </View>
        <Text style={styles.posterLabel}>Assistir trailer</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.frame}>
      <WebView
        key={embedUrl}
        source={{ uri: `${embedUrl}&autoplay=1` }}
        style={styles.webview}
        originWhitelist={ORIGIN_WHITELIST}
        onShouldStartLoadWithRequest={request => isAllowedYoutubeOrigin(request.url)}
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
      <View style={styles.controls}>
        <Pressable onPress={() => setPlaying(false)} accessibilityRole="button" accessibilityLabel="Minimizar trailer" hitSlop={8} style={styles.controlButton}>
          <Ionicons name="contract-outline" size={16} color={colors.white} />
        </Pressable>
        <Pressable
          onPress={() => { setPlaying(false); onExpand(); }}
          accessibilityRole="button"
          accessibilityLabel="Abrir trailer em tela cheia"
          hitSlop={8}
          style={styles.controlButton}
        >
          <Ionicons name="expand-outline" size={16} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.black, marginBottom: spacing.md },
  poster: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  posterShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  playBadge: { position: 'absolute', top: '50%', left: '50%', marginTop: -28, marginLeft: -28, width: 56, height: 56, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.85)' },
  posterLabel: { position: 'absolute', left: spacing.md, bottom: spacing.md, color: colors.white, fontSize: 12, fontWeight: '800' },
  webview: { flex: 1, backgroundColor: colors.black },
  controls: { position: 'absolute', top: spacing.sm, right: spacing.sm, flexDirection: 'row', gap: spacing.xs },
  controlButton: { width: 32, height: 32, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
}));
