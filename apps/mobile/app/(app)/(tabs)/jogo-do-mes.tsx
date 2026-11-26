import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Chip } from '@/components/Chip';
import { MonthTrigger } from '@/components/MonthTrigger';
import { MonthPicker } from '@/components/MonthPicker';
import { StatusPill, useStatusMeta } from '@/components/StatusPill';
import { RatingSheet } from '@/components/RatingSheet';
import { RatingValue } from '@/components/RatingValue';
import { ClubProgressCard } from '@/features/progress/ClubProgressCard';
import { ProgressConfirmSheet } from '@/components/ProgressConfirmSheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { Timeline } from '@/features/timeline/Timeline';
import { PrivateNotes } from '@/features/notes/PrivateNotes';
import { useApp } from '@/state/app-provider';
import { useGameOfMonth, useProgress, useSetProgress } from '@/state/queries';
import { useSetRating } from '@/state/library-queries';
import { formatMonth } from '@/lib/format';
import { controlTextStyle, decorInk, decorInkText, decorOutline, decorPanel, themedStyles, useThemeColors, useThemeDecor, radii, spacing, typography } from '@/theme';
import { gameCoverUrl, gameDescriptionPreview, type ProgressStatus, type RatingDetails, type RatingMode } from '@clube-do-jogo/domain';

const statusOrder: ProgressStatus[] = ['not_started', 'started', 'finished'];

type GameOfMonthTab = 'progress' | 'timeline' | 'notes';

const tabs: { key: GameOfMonthTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'progress', label: 'Progresso', icon: 'trophy-outline' },
  { key: 'timeline', label: 'Timeline', icon: 'chatbubbles-outline' },
  { key: 'notes', label: 'Notas', icon: 'create-outline' },
];

export default function GameOfMonthScreen() {
  const colors = useThemeColors();
  const decor = useThemeDecor();
  const styles = useStyles();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const statusMeta = useStatusMeta();
  const { userId, selectedMonth, activeMonth, months, isHistorical, setSelectedMonth } = useApp();
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const gameQuery = useGameOfMonth();
  const game = gameQuery.data ?? null;
  const description = gameDescriptionPreview(game?.description, 150);
  const snapshotMonth = isHistorical ? selectedMonth : null;
  const progressQuery = useProgress(game?.id ?? '', { snapshotMonth });
  const setProgress = useSetProgress();
  const setRating = useSetRating();

  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingToken, setRatingToken] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<ProgressStatus | null>(null);
  const activeTab: GameOfMonthTab = section === 'progress' || section === 'notes' ? section : 'timeline';
  const setActiveTab = (tab: GameOfMonthTab) => router.setParams({ section: tab });

  const progress = progressQuery.data ?? [];
  const mine = progress.find(item => item.user_id === userId) ?? null;

  function requestStatus(status: ProgressStatus) {
    if (!game || isHistorical || mine?.status === status) return;
    setPendingStatus(status);
  }

  function confirmStatus() {
    if (!game || !pendingStatus) return;
    setProgress.mutate({ gameId: game.id, status: pendingStatus });
    setPendingStatus(null);
  }

  function openRating() {
    setRatingToken(token => token + 1);
    setRatingOpen(true);
  }

  function saveRating(input: { rating: number; ratingMode: RatingMode; ratingDetails: RatingDetails | null }) {
    if (!game) return;
    setRating.mutate({ gameId: game.id, ...input }, { onSuccess: () => setRatingOpen(false) });
  }

  function removeRating() {
    if (!game) return;
    setRating.mutate({ gameId: game.id, rating: null, ratingMode: 'simple', ratingDetails: null }, { onSuccess: () => setRatingOpen(false) });
  }

  return (
    <Screen onRefresh={() => gameQuery.refetch()} refreshing={gameQuery.isRefetching}>
      <AppHeader
        title="Jogo do mês"
        subtitle={isHistorical ? 'Ciclo encerrado, somente leitura' : undefined}
        right={<MonthTrigger month={selectedMonth} onPress={() => setMonthPickerVisible(true)} />}
      />

      {gameQuery.isLoading ? (
        <LoadingState label="Carregando jogo do mês…" />
      ) : gameQuery.isError ? (
        <ErrorState message={gameQuery.error.message} onRetry={() => gameQuery.refetch()} />
      ) : !game ? (
        <EmptyState
          icon="calendar-outline"
          title="Jogo ainda não definido"
          description={`Um administrador ainda não definiu o jogo de ${formatMonth(selectedMonth)}.`}
        />
      ) : (
        <View style={styles.content}>
          <Pressable
            onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: game.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Ver detalhes de ${game.title}`}
            style={styles.hero}
          >
            <View style={styles.heroBackdrop} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.heroBackdropFilter}>
                <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.heroBackdropImage} contentFit="cover" blurRadius={18} />
              </View>
              <View style={styles.heroShade} />
            </View>
            {decor ? <View style={styles.heroFrame} pointerEvents="none" /> : null}
            <View style={styles.monthChip}>
              <Ionicons name="ribbon" size={13} color={decor?.onInk ?? colors.amber300} />
              <Text style={styles.monthChipText}>Jogo de {formatMonth(selectedMonth, { includeYear: false })}</Text>
            </View>
            {decor ? (
              <View style={styles.cover} accessible accessibilityRole="image" accessibilityLabel={`Capa de ${game.title}`}>
                <View style={styles.coverFilter}>
                  <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.coverImage} contentFit="cover" />
                </View>
              </View>
            ) : (
              <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
            )}
            <Text style={styles.title}>{game.title}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={13} color={colors.zinc400} />
                <Text style={styles.metaText}>{game.duration_hours} h</Text>
              </View>
              {game.release_year ? (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={13} color={colors.zinc400} />
                  <Text style={styles.metaText}>{game.release_year}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.description} numberOfLines={2}>{description.text}</Text>
            {description.hasMore ? <Text style={styles.moreLink}>Ver mais</Text> : null}
            <View style={styles.detailLink}>
              <Text style={styles.detailLinkText}>Ver detalhes</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.violet300} />
            </View>
          </Pressable>

          <View style={styles.tabRow}>
            {tabs.map(tab => (
              <Chip
                key={tab.key}
                label={tab.label}
                icon={tab.icon}
                selected={activeTab === tab.key}
                onPress={() => setActiveTab(tab.key)}
              />
            ))}
          </View>

          {activeTab === 'progress' ? (
          <>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Meu progresso</Text>
              {mine ? <StatusPill status={mine.status} /> : null}
            </View>
            <View style={styles.statusRow}>
              {statusOrder.map(status => {
                const meta = statusMeta[status];
                const active = (mine?.status ?? 'not_started') === status;
                return (
                  <Pressable
                    key={status}
                    disabled={isHistorical || active || setProgress.isPending}
                    onPress={() => requestStatus(status)}
                    accessibilityRole="button"
                    accessibilityLabel={meta.label}
                    accessibilityState={{ selected: active, disabled: isHistorical || active }}
                    style={[styles.statusOption, active && styles.statusOptionActive, (isHistorical || active) && styles.statusOptionDisabled]}
                  >
                    <Ionicons name={meta.icon} size={16} color={active ? decor?.onInk ?? colors.violet300 : colors.zinc500} />
                    <Text style={[styles.statusOptionLabel, active && styles.statusOptionLabelActive]}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {setProgress.isError ? <Text style={styles.formError}>{setProgress.error?.message}</Text> : null}
            {mine?.status === 'finished' ? (
              <View style={styles.ratingRow}>
                <View style={styles.ratingInfo}>
                  <Text style={styles.fieldLabel}>Minha nota</Text>
                  {mine.rating !== null ? <RatingValue value={mine.rating} /> : <Text style={styles.emptyMembers}>Sem nota ainda</Text>}
                </View>
                <Pressable
                  disabled={isHistorical}
                  onPress={openRating}
                  accessibilityRole="button"
                  accessibilityLabel={mine.rating !== null ? 'Editar nota' : 'Avaliar'}
                  style={styles.ratingButton}
                >
                  <Text style={styles.ratingButtonLabel}>{mine.rating !== null ? 'Editar nota' : 'Avaliar'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <ClubProgressCard
            style={styles.clubCard}
            progress={progress}
            isLoading={progressQuery.isLoading}
            error={progressQuery.error}
            onRetry={() => void progressQuery.refetch()}
          />
          </>
          ) : activeTab === 'timeline' ? (
            <Timeline gameId={game.id} clubMonth={selectedMonth} />
          ) : (
            <PrivateNotes gameId={game.id} snapshotMonth={snapshotMonth ?? undefined} />
          )}
        </View>
      )}

      <MonthPicker
        visible={monthPickerVisible}
        months={months}
        selectedMonth={selectedMonth}
        activeMonth={activeMonth}
        onSelect={setSelectedMonth}
        onClose={() => setMonthPickerVisible(false)}
      />

      {game ? (
        <RatingSheet
          key={ratingToken}
          visible={ratingOpen}
          initialRating={mine?.rating ?? null}
          initialMode={mine?.rating_mode ?? 'simple'}
          initialDetails={mine?.rating_details}
          disabled={isHistorical}
          loading={setRating.isPending}
          error={setRating.error?.message ?? null}
          onClose={() => setRatingOpen(false)}
          onSave={saveRating}
          onRemove={removeRating}
        />
      ) : null}

      <ProgressConfirmSheet
        visible={pendingStatus !== null}
        game={game}
        currentStatus={mine?.status ?? 'not_started'}
        targetStatus={pendingStatus ?? 'not_started'}
        onClose={() => setPendingStatus(null)}
        onConfirm={confirmStatus}
      />
    </Screen>
  );
}

const useStyles = themedStyles((colors, { decor, button }) => ({
  content: { gap: spacing.lg },
  clubCard: { marginBottom: 0 },
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  hero: {
    borderRadius: radii.xxxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: '#09090b',
    padding: spacing.lg,
    alignItems: 'center',
    overflow: 'hidden',
    ...decorPanel(decor, 'hero'),
  },
  heroFrame: { position: 'absolute', top: 9, left: 9, right: 9, bottom: 9, borderWidth: 1, borderColor: 'rgba(75,65,61,0.24)' },
  heroBackdrop: { position: 'absolute', top: -24, left: -24, right: -24, bottom: -24 },
  heroBackdropFilter: { ...StyleSheet.absoluteFill, ...(decor && { filter: [{ grayscale: 1 }, { brightness: 1.3 }, { contrast: 0.8 }] }) },
  heroBackdropImage: { width: '100%', height: '100%', opacity: decor ? 0.19 : 0.9 },
  heroShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,8,10,0.62)',
    ...(decor && { backgroundColor: 'transparent', experimental_backgroundImage: 'linear-gradient(180deg, rgba(216, 210, 188, 0.68), rgba(216, 210, 188, 0.94))' }),
  },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.35)',
    backgroundColor: colors.amber950,
    marginBottom: spacing.md,
    ...(decor && { ...decorInk(decor, 'chip'), borderWidth: 0 }),
  },
  monthChipText: { fontSize: 10, fontWeight: '800', color: colors.amber300, textTransform: 'uppercase', letterSpacing: 0.5, ...decorInkText(decor) },
  cover: {
    width: 150,
    aspectRatio: 3 / 4,
    borderRadius: radii.xl,
    backgroundColor: colors.zinc900,
    marginBottom: spacing.md,
    ...(decor && { borderRadius: 0, borderWidth: 4, borderColor: decor.onInk, boxShadow: decor.shadows.cover }),
  },
  coverFilter: { flex: 1, filter: [{ grayscale: 0.25 }, { sepia: 0.12 }] },
  coverImage: { width: '100%', height: '100%' },
  title: {
    ...typography.h1,
    color: colors.white,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 12,
    ...(decor && { color: colors.foreground, textShadowColor: 'transparent', textShadowRadius: 0 }),
  },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceDeep,
    ...(decor && { borderRadius: 0, backgroundColor: decor.panelDeep }),
  },
  metaText: { fontSize: 11, fontWeight: '700', color: colors.zinc400 },
  description: { ...typography.small, color: decor ? colors.zinc300 : 'rgba(255,255,255,0.78)', textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  moreLink: { fontSize: 11, fontWeight: '800', color: colors.violet300, marginTop: 4 },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
  detailLinkText: { color: colors.violet300, fontWeight: '800', fontSize: 12 },
  card: { borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.lg, gap: spacing.md },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography.h3, color: colors.foreground },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  ratingInfo: { gap: spacing.xs },
  fieldLabel: { ...typography.small, color: colors.zinc400, fontWeight: '800' },
  ratingButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    ...decorOutline(decor),
  },
  ratingButtonLabel: { fontSize: 12, fontWeight: '800', color: colors.violet300, ...controlTextStyle(button, 12) },
  statusOption: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    ...decorOutline(decor),
  },
  statusOptionActive: { borderColor: 'rgba(139,92,246,0.35)', backgroundColor: 'rgba(139,92,246,0.15)', ...decorInk(decor) },
  statusOptionDisabled: { opacity: 0.85 },
  statusOptionLabel: { fontSize: 10, fontWeight: '700', color: colors.zinc500, textAlign: 'center', ...controlTextStyle(button, 10) },
  statusOptionLabelActive: { color: colors.violet300, ...decorInkText(decor) },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600' },
  emptyMembers: { ...typography.small, color: colors.zinc600 },
}));
