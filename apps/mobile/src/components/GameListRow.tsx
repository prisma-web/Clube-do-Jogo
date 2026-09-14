import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { gameCoverUrl, type Game } from '@clube-do-jogo/domain';

export function GameListRow({ game, onPress, action, subtitle }: {
  game: Game;
  onPress?: () => void;
  action?: ReactNode;
  subtitle?: ReactNode;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const details = (
    <>
      <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{game.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={12} color={colors.zinc500} />
          <Text style={styles.metaText}>{game.duration_hours} h</Text>
        </View>
        {subtitle}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          {details}
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Ver detalhes de ${game.title}`}
          style={({ pressed }) => [styles.detailsPressable, pressed && styles.pressed]}
        >
          {details}
        </Pressable>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
  },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  detailsPressable: { flex: 1, flexDirection: 'row', gap: spacing.md, alignItems: 'center', minWidth: 0 },
  cover: { width: 56, height: 76, borderRadius: radii.sm, backgroundColor: colors.zinc900 },
  info: { flex: 1, gap: 6, minWidth: 0 },
  title: { ...typography.h3, fontSize: 14, color: colors.foreground },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.tiny, color: colors.zinc500, textTransform: 'none' },
  action: { alignItems: 'flex-end', justifyContent: 'center', gap: spacing.xs },
}));
