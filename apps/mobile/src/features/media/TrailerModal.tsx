import { useEffect } from 'react';
import { AppState, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { themedStyles, useThemeColors, radii, spacing } from '@/theme';
import { youtubeEmbedUrl } from './youtube';
import { YoutubePlayer } from './YoutubePlayer';

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
          <YoutubePlayer embedUrl={embedUrl} title={title} style={styles.webview} />
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
