import { useEffect } from 'react';
import { AppState, Modal, Pressable, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { themedStyles, useThemeColors, radii, spacing } from '@/theme';
import { isAllowedYoutubeOrigin, youtubeEmbedUrl } from './youtube';

// Let the request guard reject outside links; a whitelist rejection opens the system browser.
const ORIGIN_WHITELIST = ['*'];

export function TrailerModal({ visible, url, title, onClose }: {
  visible: boolean;
  url: string | null | undefined;
  title: string;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const embedUrl = youtubeEmbedUrl(url);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') onClose();
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  if (!visible || !embedUrl) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop} accessible={false}>
        <View style={styles.frame} accessible={false}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar trailer"
            hitSlop={12}
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
          <WebView
            key={embedUrl}
            source={{ uri: embedUrl }}
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
        </View>
      </View>
    </Modal>
  );
}

const useStyles = themedStyles(colors => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.black },
  webview: { flex: 1, backgroundColor: colors.black },
  close: { position: 'absolute', right: spacing.sm, top: spacing.sm, zIndex: 1, width: 36, height: 36, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
}));
