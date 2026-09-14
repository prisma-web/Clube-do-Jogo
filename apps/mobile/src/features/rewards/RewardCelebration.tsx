import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { themeIdFromReward, type RewardGrant } from '@clube-do-jogo/domain';
import { useMobilePreferences } from '@/hooks/use-mobile-preferences';
import { useAcknowledgeReward } from '@/state/reward-queries';
import { radii, spacing, themedStyles, typography, useNativeTheme, useThemeColors } from '@/theme';
import { formatMonth } from '@/lib/format';
import { useLoop } from '@/features/themes/animation';

const confetti: { left: DimensionValue; duration: number; offset: number }[] = [
  { left: '8%', duration: 2400, offset: 0 },
  { left: '22%', duration: 2900, offset: 0.35 },
  { left: '37%', duration: 2600, offset: 0.62 },
  { left: '52%', duration: 3100, offset: 0.12 },
  { left: '68%', duration: 2500, offset: 0.48 },
  { left: '84%', duration: 2800, offset: 0.8 },
];

export function RewardCelebration({ grant, onClose }: { grant: RewardGrant; onClose(): void }) {
  const theme = useNativeTheme();
  const colors = useThemeColors();
  const styles = useStyles();
  const acknowledge = useAcknowledgeReward();
  const preferences = useMobilePreferences();
  const [failed, setFailed] = useState(false);

  const month = formatMonth(grant.reward.cycle?.month || grant.reward.club_month, { includeYear: false });
  const gameTitle = grant.reward.cycle?.game?.title || 'o jogo do clube';
  const themeId = themeIdFromReward(grant.reward);

  const confirm = useCallback(
    (applyTheme: boolean) => {
      setFailed(false);
      acknowledge.mutate(grant.id, {
        onSuccess: () => {
          if (applyTheme && themeId) preferences.setThemeId(themeId);
          onClose();
        },
        onError: () => setFailed(true),
      });
    },
    [acknowledge, grant.id, onClose, preferences, themeId],
  );

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => confirm(false)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal testID="reward-celebration">
          {theme.animated ? (
            <View style={styles.confettiLayer} pointerEvents="none">
              {confetti.map(piece => (
                <Confetti key={String(piece.left)} {...piece} color={colors.violet400} />
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={() => confirm(false)}
            disabled={acknowledge.isPending}
            accessibilityRole="button"
            accessibilityLabel="Fechar e marcar como vista"
            hitSlop={10}
            style={styles.close}
            testID="reward-close"
          >
            <Ionicons name="close" size={18} color={colors.zinc400} />
          </Pressable>

          <View style={styles.badge}>
            <Ionicons name="gift" size={22} color={colors.violet300} />
          </View>
          <Text style={styles.eyebrow}>Conquista desbloqueada</Text>
          <Text style={styles.title} accessibilityRole="header">Você recebeu uma recompensa!</Text>
          <Text style={styles.subtitle}>
            {grant.reward.eligibility === 'all_members' ? 'Por participar do ciclo de ' : 'Por ter finalizado o jogo de '}{month}: <Text style={styles.subtitleStrong}>{gameTitle}</Text>.
          </Text>

          {grant.reward.image_url ? (
            <View style={styles.art}>
              <Image source={{ uri: grant.reward.image_url }} style={styles.artImage} contentFit="contain" transition={220} />
            </View>
          ) : null}

          <View style={styles.rewardCard}>
            <View style={styles.rewardCheck}>
              <Ionicons name="checkmark" size={15} color={colors.emerald400} />
            </View>
            <View style={styles.rewardText}>
              <Text style={styles.rewardName}>{grant.reward.name}</Text>
              <Text style={styles.rewardDescription}>
                {grant.reward.description || 'Um novo item cosmético entrou na sua coleção.'}
              </Text>
            </View>
          </View>

          {failed ? (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={15} color={colors.red400} />
              <Text style={styles.errorText}>
                Não foi possível confirmar a recompensa agora. Ela continua sua e volta a aparecer depois.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {themeId ? (
              <Pressable
                onPress={() => confirm(true)}
                disabled={acknowledge.isPending}
                accessibilityRole="button"
                accessibilityLabel="Usar tema agora"
                accessibilityState={{ disabled: acknowledge.isPending }}
                style={[styles.primary, acknowledge.isPending && styles.actionDisabled]}
                testID="reward-use-theme"
              >
                {acknowledge.isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.primaryLabel}>Usar tema agora</Text>
                )}
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => confirm(false)}
              disabled={acknowledge.isPending}
              accessibilityRole="button"
              accessibilityLabel={failed ? 'Tentar confirmar novamente' : themeId ? 'Agora não' : 'Que demais!'}
              accessibilityState={{ disabled: acknowledge.isPending }}
              style={[styles.secondary, acknowledge.isPending && styles.actionDisabled]}
              testID="reward-acknowledge"
            >
              <Text style={styles.secondaryLabel}>
                {failed ? 'Tentar de novo' : themeId ? 'Agora não' : 'Que demais!'}
              </Text>
            </Pressable>

            {failed ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar sem confirmar"
                style={styles.ghost}
                testID="reward-dismiss"
              >
                <Text style={styles.ghostLabel}>Fechar sem confirmar</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Confetti({ left, duration, offset, color }: {
  left: DimensionValue;
  duration: number;
  offset: number;
  color: string;
}) {
  const progress = useLoop(true, duration, offset);
  const style = useAnimatedStyle(() => {
    const phase = progress.value % 1;
    return {
      opacity: interpolate(phase, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
      transform: [{ translateY: phase * 150 }, { rotate: `${phase * 300}deg` }],
    };
  });
  return <Animated.View style={[confettiStyles.piece, { left, backgroundColor: color }, style]} />;
}

const confettiStyles = StyleSheet.create({
  piece: { position: 'absolute', top: -12, width: 6, height: 12, borderRadius: 3 },
});

const useStyles = themedStyles(colors => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radii.xxxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  confettiLayer: { position: 'absolute', left: 0, right: 0, top: 0, height: 170 },
  close: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  eyebrow: { ...typography.tiny, color: colors.violet300, marginTop: spacing.xs },
  title: { ...typography.h1, fontSize: 24, color: colors.foreground, textAlign: 'center' },
  subtitle: { ...typography.small, color: colors.zinc400, textAlign: 'center', lineHeight: 18 },
  subtitleStrong: { color: colors.foreground, fontWeight: '800' },
  art: {
    width: '72%',
    aspectRatio: 4 / 3,
    borderRadius: radii.xxl,
    marginVertical: spacing.md,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  artImage: { flex: 1, margin: spacing.md },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    alignSelf: 'stretch',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.md,
  },
  rewardCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDeep,
  },
  rewardText: { flex: 1, gap: 3 },
  rewardName: { ...typography.small, fontWeight: '800', color: colors.foreground },
  rewardDescription: { fontSize: 11, fontWeight: '600', color: colors.zinc500, lineHeight: 15 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.red600,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.red300, lineHeight: 15 },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  primary: {
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violet600,
  },
  primaryLabel: { ...typography.small, fontWeight: '800', color: colors.white },
  secondary: {
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  secondaryLabel: { ...typography.small, fontWeight: '800', color: colors.zinc300 },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center' },
  ghostLabel: { ...typography.small, color: colors.zinc500 },
  actionDisabled: { opacity: 0.6 },
}));
