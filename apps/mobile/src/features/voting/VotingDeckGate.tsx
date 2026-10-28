import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { gameCoverUrl, type VoteChoice } from '@clube-do-jogo/domain';
import { useApp } from '@/state/app-provider';
import { useRanking, useVote } from '@/state/queries';
import { radii, spacing, themedStyles, typography, useThemeColors } from '@/theme';
import { createMobileApiTransport, getMobileSupabaseClient } from '@/platform';
import { shiftMonth } from '@/lib/format';
import { recentVotingItems } from './voting-deck';

const swipeThreshold = 88;

type DeckAction = VoteChoice | null;

export function VotingDeckGate() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useStyles();
  const { isHistorical, selectedMonth } = useApp();
  const ranking = useRanking();
  const vote = useVote();
  const [closed, setClosed] = useState(false);
  const [dismissedGameIds, setDismissedGameIds] = useState<ReadonlySet<string>>(() => new Set());
  const translateX = useRef(new Animated.Value(0)).current;

  const cards = useMemo(
    () => recentVotingItems(ranking.data ?? []).filter(item => !dismissedGameIds.has(item.game.id)),
    [dismissedGameIds, ranking.data],
  );
  const card = cards[0];
  const visible = !closed && !isHistorical && ranking.isSuccess && Boolean(card);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      setClosed(false);
      setDismissedGameIds(new Set());
      void ranking.refetch();
    });
    return () => subscription.remove();
  }, [ranking.refetch]);

  useEffect(() => {
    if (!card) return;
    const transport = createMobileApiTransport(getMobileSupabaseClient());
    const report = (action: 'opened' | 'closed') => {
      void transport.request('/api/push/voting-threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, voteMonth: shiftMonth(selectedMonth, 1) }),
      }).catch(() => {});
    };
    report('opened');
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') report('closed');
    });
    return () => subscription.remove();
  }, [card, selectedMonth]);

  const resetPosition = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
  };

  const advance = () => setDismissedGameIds(current => new Set([...current, card?.game.id].filter((id): id is string => Boolean(id))));

  const commit = (choice: DeckAction, direction: -1 | 0 | 1 = 0) => {
    if (!card || vote.isPending) return;
    const finish = () => {
      translateX.setValue(0);
      advance();
    };
    const save = () => vote.mutate({ gameId: card.game.id, choice }, { onSuccess: finish });

    if (direction === 0) {
      save();
      return;
    }

    Animated.timing(translateX, {
      toValue: direction * 420,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) save();
      else resetPosition();
    });
  };

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => translateX.setValue(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx >= swipeThreshold) commit('would_play', 1);
      else if (gesture.dx <= -swipeThreshold) commit('would_not_play', -1);
      else resetPosition();
    },
    onPanResponderTerminate: resetPosition,
  });

  const cardStyle = {
    transform: [
      { translateX },
      {
        rotate: translateX.interpolate({
          inputRange: [-220, 0, 220],
          outputRange: ['-10deg', '0deg', '10deg'],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  if (!card) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setClosed(true)}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Pressable
            onPress={() => setClosed(true)}
            accessibilityRole="button"
            accessibilityLabel="Fechar votação rápida"
            hitSlop={12}
            style={styles.close}
            testID="voting-deck-close"
          >
            <Ionicons name="close" size={22} color={colors.zinc400} />
          </Pressable>

          <Text style={styles.eyebrow}>VOTAÇÃO RÁPIDA</Text>
          <Text style={styles.heading} accessibilityRole="header">Qual jogo você quer no clube?</Text>
          <Text style={styles.helper}>Deslize para escolher os jogos adicionados recentemente.</Text>

          <View style={styles.deck}>
            <Animated.View
              {...panResponder.panHandlers}
              style={[styles.card, cardStyle]}
              accessibilityLabel={`${card.game.title}, jogo ${dismissedGameIds.size + 1} de ${dismissedGameIds.size + cards.length}`}
              testID="voting-deck-card"
            >
              <Pressable
                onPress={() => {
                  setClosed(true);
                  router.push({ pathname: '/(app)/jogos/[id]', params: { id: card.game.id } });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalhes de ${card.game.title}`}
                style={styles.coverPressable}
              >
                <Image source={{ uri: gameCoverUrl(card.game.image_url) }} style={styles.cover} contentFit="cover" />
                <View style={styles.coverHint}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.white} />
                  <Text style={styles.coverHintLabel}>Toque para saber mais</Text>
                </View>
              </Pressable>
              <View style={styles.cardBody}>
                <Text style={styles.title} numberOfLines={2}>{card.game.title}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[card.game.release_year, card.game.duration_hours ? `${card.game.duration_hours} h` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Animated.View>
          </View>

          <View style={styles.actions}>
            <DeckButton
              accessibilityLabel={`Votar não em ${card.game.title}`}
              icon="thumbs-down"
              label="Não"
              color={colors.red400}
              onPress={() => commit('would_not_play', -1)}
              disabled={vote.isPending}
              testID="voting-deck-no"
            />
            <DeckButton
              accessibilityLabel={`Deixar neutro ${card.game.title}`}
              icon="remove"
              label="Neutro"
              color={colors.zinc300}
              onPress={() => commit(null)}
              disabled={vote.isPending}
              testID="voting-deck-neutral"
            />
            <DeckButton
              accessibilityLabel={`Votar jogaria em ${card.game.title}`}
              icon="thumbs-up"
              label="Jogaria"
              color={colors.emerald400}
              onPress={() => commit('would_play', 1)}
              disabled={vote.isPending}
              testID="voting-deck-yes"
            />
          </View>
          {vote.isPending ? <ActivityIndicator color={colors.violet300} style={styles.loading} /> : null}
          {vote.isError ? <Text style={styles.error} accessibilityRole="alert">{vote.error.message}</Text> : null}
          <Text style={styles.progress}>{dismissedGameIds.size + 1} de {dismissedGameIds.size + cards.length}</Text>
        </View>
      </View>
    </Modal>
  );
}

function DeckButton({ accessibilityLabel, icon, label, color, onPress, disabled, testID }: {
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress(): void;
  disabled: boolean;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
      testID={testID}
    >
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = themedStyles(colors => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.76)' },
  dialog: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    borderRadius: radii.xxxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  close: { position: 'absolute', zIndex: 2, top: spacing.md, right: spacing.md, padding: spacing.xs },
  eyebrow: { ...typography.tiny, color: colors.violet300, marginRight: spacing.xxxl },
  heading: { ...typography.h2, color: colors.foreground, marginTop: spacing.xs, marginRight: spacing.xxxl },
  helper: { ...typography.small, color: colors.zinc400, lineHeight: 18, marginTop: spacing.sm },
  deck: { height: 334, marginTop: spacing.lg, justifyContent: 'center' },
  card: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    shadowColor: colors.black,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  coverPressable: { height: 238, backgroundColor: colors.surfaceDeep },
  cover: { width: '100%', height: '100%' },
  coverHint: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(0,0,0,0.66)', borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  coverHintLabel: { color: colors.white, fontSize: 10, fontWeight: '800' },
  cardBody: { padding: spacing.md },
  title: { ...typography.h3, color: colors.foreground },
  meta: { ...typography.small, color: colors.zinc400, marginTop: 3 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  action: { flex: 1, minHeight: 54, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center', gap: 2 },
  actionLabel: { fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  loading: { marginTop: spacing.md },
  error: { ...typography.small, color: colors.red300, textAlign: 'center', marginTop: spacing.md },
  progress: { ...typography.tiny, color: colors.zinc600, textAlign: 'center', marginTop: spacing.md },
}));
