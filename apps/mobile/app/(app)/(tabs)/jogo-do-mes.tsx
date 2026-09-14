import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { ProgressConfirmSheet } from '@/components/ProgressConfirmSheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { Timeline } from '@/features/timeline/Timeline';
import { PrivateNotes } from '@/features/notes/PrivateNotes';
import { useApp } from '@/state/app-provider';
import { useGameOfMonth, useProgress, useSetProgress } from '@/state/queries';
import { useSetRating } from '@/state/library-queries';
import { formatMonth, formatShortDate } from '@/lib/format';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { gameCoverUrl, type ProgressStatus, type RatingDetails, type RatingMode } from '@clube-do-jogo/domain';

const statusOrder: ProgressStatus[] = ['not_started', 'started', 'finished'];

type GameOfMonthTab = 'progress' | 'timeline' | 'notes';

const tabs: { key: GameOfMonthTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'progress', label: 'Progresso', icon: 'trophy-outline' },
  { key: 'timeline', label: 'Timeline', icon: 'chatbubbles-outline' },
  { key: 'notes', label: 'Notas', icon: 'create-outline' },
];

export default function GameOfMonthScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const statusMeta = useStatusMeta();
  const { userId, selectedMonth, activeMonth, months, isHistorical, setSelectedMonth } = useApp();
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const gameQuery = useGameOfMonth();
  const game = gameQuery.data ?? null;
  const progressQuery = useProgress(game?.id ?? '');
  const setProgress = useSetProgress();
  const setRating = useSetRating();

  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingToken, setRatingToken] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<ProgressStatus | null>(null);
  const activeTab: GameOfMonthTab = section === 'progress' || section === 'notes' ? section : 'timeline';
  const setActiveTab = (tab: GameOfMonthTab) => router.setParams({ section: tab });

  const progress = progressQuery.data ?? [];
  const mine = progress.find(item => item.user_id === userId) ?? null;
  const finishedCount = progress.filter(item => item.status === 'finished').length;
  const ratedProgress = progress.filter(item => item.rating !== null);
  const clubAverage = ratedProgress.length
    ? ratedProgress.reduce((total, item) => total + Number(item.rating), 0) / ratedProgress.length
    : null;

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
            <View style={styles.monthChip}>
              <Ionicons name="ribbon" size={13} color={colors.amber300} />
              <Text style={styles.monthChipText}>Jogo de {formatMonth(selectedMonth, { includeYear: false })}</Text>
            </View>
            <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
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
            <Text style={styles.description} numberOfLines={2}>{game.description}</Text>
            {game.description.length > 150 ? <Text style={styles.moreLink}>Ver mais</Text> : null}
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
                    <Ionicons name={meta.icon} size={16} color={active ? colors.violet300 : colors.zinc500} />
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

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Progresso do clube</Text>
              <View style={styles.cardHeaderMeta}>
                {clubAverage !== null ? <RatingValue value={clubAverage} /> : null}
                <Text style={styles.finishedCount}>{finishedCount} {finishedCount === 1 ? 'finalizou' : 'finalizaram'}</Text>
              </View>
            </View>
            {progressQuery.isLoading ? (
              <LoadingState label="Carregando progresso do clube…" />
            ) : progressQuery.isError ? (
              <ErrorState message={progressQuery.error.message} onRetry={() => progressQuery.refetch()} />
            ) : progress.length ? (
              <View style={{ gap: spacing.sm }}>
                {progress.map(item => (
                  <View key={item.user_id} style={styles.memberRow}>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName} numberOfLines={1}>{item.profile?.name || 'Membro'}</Text>
                      {item.started_at || item.finished_at ? (
                        <View style={styles.memberDates}>
                          {item.started_at ? (
                            <View style={styles.memberDateChip}>
                              <Ionicons name="time-outline" size={12} color={colors.sky400} />
                              <Text style={styles.memberDateText}>{formatShortDate(item.started_at)}</Text>
                            </View>
                          ) : null}
                          {item.finished_at ? (
                            <View style={styles.memberDateChip}>
                              <Ionicons name="checkmark-done-outline" size={12} color={colors.emerald400} />
                              <Text style={styles.memberDateText}>{formatShortDate(item.finished_at)}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.memberMeta}>
                      {item.rating !== null ? <RatingValue value={item.rating} size={11} /> : null}
                      <StatusPill status={item.status} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyMembers}>Ninguém registrou progresso ainda.</Text>
            )}
          </View>
          </>
          ) : activeTab === 'timeline' ? (
            <Timeline gameId={game.id} clubMonth={selectedMonth} />
          ) : (
            <PrivateNotes gameId={game.id} />
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
        currentStatus={mine?.status ?? 'not_started'}
        targetStatus={pendingStatus ?? 'not_started'}
        onClose={() => setPendingStatus(null)}
        onConfirm={confirmStatus}
      />
    </Screen>
  );
}

const useStyles = themedStyles(colors => ({
  content: { gap: spacing.lg },
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  hero: {
    borderRadius: radii.xxxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.lg,
    alignItems: 'center',
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
  },
  monthChipText: { fontSize: 10, fontWeight: '800', color: colors.amber300, textTransform: 'uppercase', letterSpacing: 0.5 },
  cover: { width: 150, aspectRatio: 3 / 4, borderRadius: radii.xl, backgroundColor: colors.zinc900, marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.foreground, textAlign: 'center' },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceDeep,
  },
  metaText: { fontSize: 11, fontWeight: '700', color: colors.zinc400 },
  description: { ...typography.small, color: colors.zinc400, textAlign: 'center', marginTop: spacing.md, lineHeight: 18 },
  moreLink: { fontSize: 11, fontWeight: '800', color: colors.violet300, marginTop: 4 },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
  detailLinkText: { color: colors.violet300, fontWeight: '800', fontSize: 12 },
  card: { borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.lg, gap: spacing.md },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  },
  ratingButtonLabel: { fontSize: 12, fontWeight: '800', color: colors.violet300 },
  statusOption: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
  },
  statusOptionActive: { borderColor: 'rgba(139,92,246,0.35)', backgroundColor: 'rgba(139,92,246,0.15)' },
  statusOptionDisabled: { opacity: 0.85 },
  statusOptionLabel: { fontSize: 10, fontWeight: '700', color: colors.zinc500, textAlign: 'center' },
  statusOptionLabelActive: { color: colors.violet300 },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600' },
  finishedCount: { fontSize: 10, fontWeight: '800', color: colors.zinc600, textTransform: 'uppercase' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  memberInfo: { flex: 1, marginRight: spacing.sm, gap: 4 },
  memberName: { ...typography.small, color: colors.zinc300 },
  memberDates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  memberDateChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberDateText: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emptyMembers: { ...typography.small, color: colors.zinc600 },
}));
