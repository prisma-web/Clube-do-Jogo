import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { AddGameToVoteSheet } from '@/components/AddGameToVoteSheet';
import { Chip } from '@/components/Chip';
import { PreferenceButtons } from '@/components/PreferenceButtons';
import { Sheet } from '@/components/Sheet';
import { VoteParticipantsSheet } from '@/components/VoteParticipantsSheet';
import { VoteReasonSheet, voteReasonLabel } from '@/components/VoteReasonSheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { formatMonth, formatShortDate, shiftMonth } from '@/lib/format';
import { getRankingFormula } from '@/platform/config';
import { useClubGameAdminAction } from '@/features/admin';
import { useApp } from '@/state/app-provider';
import { useBacklog, useRanking, useVote } from '@/state/queries';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import {
  buildRankingGroups,
  computeRankingPlacements,
  filterRankingBySearch,
  sortRankingForView,
  type RankingGroup,
  type RankingView as RankingViewMode,
} from '@/features/ranking/ranking-view';
import { gameCoverUrl, type Game, type RankingItem, type VoteChoice, type VoteReason } from '@clube-do-jogo/domain';

const rankingViews: Array<{ value: RankingViewMode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'ranking', label: 'Ranking atual', icon: 'reorder-four-outline' },
  { value: 'recent', label: 'Adicionados recentemente', icon: 'calendar-outline' },
];

const rankingFormula = getRankingFormula();

function AnimatedPoints({ value, style, unitStyle }: { value: number; style: object; unitStyle: object }) {
  const [animated] = useState(() => new Animated.Value(value));
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const listenerId = animated.addListener(({ value: current }) => {
      setDisplay(rankingFormula === 'legacy' ? Math.round(current * 10) / 10 : Math.round(current));
    });
    return () => animated.removeListener(listenerId);
  }, [animated]);

  useEffect(() => {
    const animation = Animated.spring(animated, { toValue: value, useNativeDriver: false, friction: 8, tension: 40 });
    animation.start();
    return () => animation.stop();
  }, [animated, value]);

  return (
    <Text style={style} accessibilityLabel={`${value} pontos`}>
      {rankingFormula === 'legacy' ? display.toFixed(1) : Math.round(display)}
      <Text style={unitStyle}> pts</Text>
    </Text>
  );
}

export default function RankingScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const { isAdmin, isHistorical, selectedMonth } = useApp();
  const voteMonth = shiftMonth(selectedMonth, 1);
  const rankingQuery = useRanking();
  const vote = useVote();
  const backlog = useBacklog();
  const clubGameAdmin = useClubGameAdminAction();
  const [reasonTarget, setReasonTarget] = useState<{ item?: RankingItem; game?: Game } | null>(null);
  const [reasonToken, setReasonToken] = useState(0);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [participantsTarget, setParticipantsTarget] = useState<{ item: RankingItem; choice: VoteChoice } | null>(null);
  const [actionsTarget, setActionsTarget] = useState<RankingItem | null>(null);
  const [rankingSearch, setRankingSearch] = useState('');
  const [rankingView, setRankingView] = usePersistentState<RankingViewMode>('clube-do-jogo:mobile:ranking-view', 'ranking');
  const [showAll, setShowAll] = useState(false);

  const ranking = useMemo(() => rankingQuery.data ?? [], [rankingQuery.data]);
  const placements = useMemo(() => computeRankingPlacements(ranking), [ranking]);
  const filteredRanking = useMemo(
    () => sortRankingForView(filterRankingBySearch(ranking, rankingSearch), rankingView),
    [ranking, rankingSearch, rankingView],
  );
  const rankingGroups = useMemo(
    () => buildRankingGroups(filteredRanking, rankingView, placements),
    [filteredRanking, placements, rankingView],
  );
  const visibleGroups = showAll ? rankingGroups : rankingGroups.slice(0, 10);
  const sections = useMemo(() => visibleGroups.map(group => ({ ...group, data: group.items })), [visibleGroups]);

  function changeSearch(value: string) {
    setRankingSearch(value);
    setShowAll(false);
  }

  function changeView(value: RankingViewMode) {
    setRankingView(value);
    setShowAll(false);
  }

  function choose(item: RankingItem, choice: VoteChoice) {
    if (isHistorical) return;
    if (choice === 'would_not_play') {
      if (item.myChoice === 'would_not_play') {
        vote.mutate({ gameId: item.game.id, choice: null });
        return;
      }
      setReasonToken(token => token + 1);
      setReasonTarget({ item });
      return;
    }
    vote.mutate({ gameId: item.game.id, choice: item.myChoice === choice ? null : choice });
  }

  function chooseSearch(game: Game, choice: VoteChoice) {
    if (isHistorical) return;
    const existing = ranking.find(item => item.game.id === game.id);
    if (existing) {
      choose(existing, choice);
      return;
    }
    if (choice === 'would_not_play') {
      setReasonToken(token => token + 1);
      setReasonTarget({ game });
      return;
    }
    vote.mutate({ gameId: game.id, choice: 'would_play' });
  }

  function confirmReason(reason: VoteReason, reasonText: string | null) {
    if (!reasonTarget) return;
    const target = reasonTarget;
    setReasonTarget(null);
    if (target.item) {
      vote.mutate({ gameId: target.item.game.id, choice: 'would_not_play', reason, reasonText: reasonText ?? undefined });
    } else if (target.game) {
      vote.mutate({ gameId: target.game.id, choice: 'would_not_play', reason, reasonText: reasonText ?? undefined });
    }
  }

  function addToLibrary(item: RankingItem) {
    setActionsTarget(null);
    if (item.inBacklog || isHistorical) return;
    backlog.mutate({ gameId: item.game.id, inBacklog: true });
  }

  const showFilters = ranking.length > 0;
  const searchedEmpty = ranking.length > 0 && filteredRanking.length === 0;

  return (
    <Screen scroll={false}>
      <SectionList
        style={styles.flatList}
        sections={sections}
        keyExtractor={item => item.game.id}
        renderSectionHeader={({ section }: { section: RankingGroup & { data: RankingItem[] } }) => (
          <View style={styles.sectionHeader}>
            {section.placement ? (
              <View
                style={[
                  styles.medal,
                  section.placement === 1 && styles.medalGold,
                  section.placement === 2 && styles.medalSilver,
                  section.placement === 3 && styles.medalBronze,
                ]}
                accessibilityLabel={`${section.placement}º lugar`}
              >
                <Text
                  style={[
                    styles.medalText,
                    (section.placement === 1 || section.placement === 2) && styles.medalTextDark,
                  ]}
                >
                  {section.placement}º
                </Text>
              </View>
            ) : (
              <View style={styles.dateChip}>
                <Ionicons name="calendar-outline" size={13} color={colors.zinc300} />
                <Text style={styles.dateChipLabel}>{section.label}</Text>
              </View>
            )}
            <View style={styles.sectionLine} />
          </View>
        )}
        renderItem={({ item }: { item: RankingItem }) => {
          const placement = placements.get(item.game.id) || 0;
          return (
            <View style={[styles.card, placement === 1 && styles.cardLeader]}>
              <Pressable
                onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: item.game.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalhes de ${item.game.title}`}
                style={styles.row}
              >
                <Image source={{ uri: gameCoverUrl(item.game.image_url) }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${item.game.title}`} />
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={2}>{item.game.title}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="time-outline" size={11} color={colors.zinc500} />
                    <Text style={styles.metaText}>{item.game.duration_hours} h</Text>
                    {rankingView === 'recent' ? (
                      <>
                        <Ionicons name="add-circle-outline" size={11} color={colors.zinc500} style={{ marginLeft: spacing.sm }} />
                        <Text style={styles.metaText}>{formatShortDate(item.addedAt)}</Text>
                      </>
                    ) : null}
                  </View>
                  <AnimatedPoints value={item.totalPoints} style={styles.points} unitStyle={styles.pointsUnit} />
                </View>
                {!isHistorical ? (
                  <Pressable
                    onPress={() => setActionsTarget(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Opções de ${item.game.title}`}
                    style={styles.moreButton}
                    hitSlop={8}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color={colors.zinc400} />
                  </Pressable>
                ) : null}
              </Pressable>

              <View style={styles.countsRow}>
                <Pressable
                  onPress={() => setParticipantsTarget({ item, choice: 'would_play' })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver quem votou Jogaria em ${item.game.title}`}
                  style={styles.countChip}
                >
                  <Ionicons name="thumbs-up" size={13} color={colors.emerald400} />
                  <Text style={styles.countText}>{item.choiceCounts.would_play}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setParticipantsTarget({ item, choice: 'would_not_play' })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver quem votou Não em ${item.game.title}`}
                  style={styles.countChip}
                >
                  <Ionicons name="thumbs-down" size={13} color={colors.red400} />
                  <Text style={styles.countText}>{item.choiceCounts.would_not_play}</Text>
                </Pressable>
              </View>

              {item.myChoice === 'would_not_play' && item.myReason ? (
                <Text style={styles.myReason}>Meu motivo: {voteReasonLabel(item.myReason)}</Text>
              ) : null}

              <PreferenceButtons value={item.myChoice} disabled={isHistorical || vote.isPending} onChange={choice => choose(item, choice)} />
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshing={rankingQuery.isRefetching}
        onRefresh={() => rankingQuery.refetch()}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <AppHeader
              title={`Votação para ${formatMonth(voteMonth, { includeYear: isHistorical })}`}
              subtitle={isHistorical ? 'Resultado preservado do ciclo encerrado' : 'Vote nos jogos do próximo ciclo'}
              right={!isHistorical ? (
                <Pressable
                  onPress={() => setAddSheetOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Adicionar jogo à votação"
                  style={styles.addButton}
                >
                  <Ionicons name="add" size={20} color={colors.violet300} />
                </Pressable>
              ) : undefined}
            />

            {vote.isError ? <Text style={styles.formError}>{vote.error?.message}</Text> : null}
            {backlog.isError ? <Text style={styles.formError}>{backlog.error?.message}</Text> : null}

            {showFilters ? (
              <>
                <View style={styles.searchField}>
                  <Ionicons name="search" size={16} color={colors.zinc600} />
                  <TextInput
                    value={rankingSearch}
                    onChangeText={changeSearch}
                    placeholder="Buscar no ranking"
                    placeholderTextColor={colors.zinc600}
                    style={styles.searchInput}
                    accessibilityLabel="Buscar no ranking"
                  />
                </View>
                <View style={styles.chipsRow}>
                  {rankingViews.map(item => (
                    <Chip key={item.value} label={item.label} icon={item.icon} selected={rankingView === item.value} onPress={() => changeView(item.value)} />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          rankingQuery.isLoading ? (
            <LoadingState label="Carregando ranking…" />
          ) : rankingQuery.isError ? (
            <ErrorState message={rankingQuery.error.message} onRetry={() => rankingQuery.refetch()} />
          ) : searchedEmpty ? (
            <EmptyState icon="search-outline" title="Nenhum jogo encontrado" />
          ) : (
            <EmptyState icon="trophy-outline" title="A votação está vazia" description="Ainda não há jogos votados neste ciclo." />
          )
        }
        ListFooterComponent={
          rankingGroups.length > 10 ? (
            <Pressable
              onPress={() => setShowAll(value => !value)}
              accessibilityRole="button"
              accessibilityLabel={showAll ? `Mostrar 10 ${rankingView === 'recent' ? 'dias' : 'colocações'}` : `Ver todos os ${rankingGroups.length} ${rankingView === 'recent' ? 'dias' : 'colocações'}`}
              style={styles.pagination}
            >
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={colors.zinc300} />
              <Text style={styles.paginationLabel}>
                {showAll ? `Mostrar 10 ${rankingView === 'recent' ? 'dias' : 'colocações'}` : `Ver todos os ${rankingGroups.length} ${rankingView === 'recent' ? 'dias' : 'colocações'}`}
              </Text>
            </Pressable>
          ) : null
        }
      />

      <VoteReasonSheet
        key={reasonToken}
        visible={Boolean(reasonTarget)}
        initialReason={reasonTarget?.item?.myReason}
        initialText={reasonTarget?.item?.myReasonText}
        onClose={() => setReasonTarget(null)}
        onConfirm={confirmReason}
      />

      <AddGameToVoteSheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        ranking={ranking}
        onChoose={chooseSearch}
      />

      <VoteParticipantsSheet
        key={participantsTarget ? `${participantsTarget.item.game.id}:${participantsTarget.choice}` : 'closed'}
        visible={Boolean(participantsTarget)}
        onClose={() => setParticipantsTarget(null)}
        profiles={participantsTarget?.item.choiceProfiles ?? { would_play: [], would_not_play: [] }}
        initialChoice={participantsTarget?.choice ?? 'would_play'}
      />

      <Sheet visible={Boolean(actionsTarget)} title={actionsTarget?.game.title ?? ''} onClose={() => setActionsTarget(null)}>
        {actionsTarget ? (
          <View style={styles.sheetBody}>
            <Pressable
              disabled={actionsTarget.inBacklog}
              onPress={() => addToLibrary(actionsTarget)}
              accessibilityRole="button"
              accessibilityLabel={actionsTarget.inBacklog ? 'Já está em Meus Jogos' : 'Adicionar a Meus Jogos'}
              style={[styles.sheetItem, actionsTarget.inBacklog && styles.sheetItemDisabled]}
            >
              <Ionicons name={actionsTarget.inBacklog ? 'checkmark' : 'library-outline'} size={18} color={actionsTarget.inBacklog ? colors.emerald400 : colors.zinc400} />
              <Text style={[styles.sheetItemLabel, actionsTarget.inBacklog && styles.sheetItemLabelDone]}>
                {actionsTarget.inBacklog ? 'Já está em Meus Jogos' : 'Adicionar a Meus Jogos'}
              </Text>
            </Pressable>
            {isAdmin ? (
              <Pressable
                onPress={() => {
                  const game = actionsTarget.game;
                  setActionsTarget(null);
                  clubGameAdmin.openFor(game);
                }}
                accessibilityRole="button"
                accessibilityLabel="Gerenciar jogo do clube"
                style={styles.sheetItem}
              >
                <Ionicons name="ribbon-outline" size={18} color={colors.amber400} />
                <Text style={styles.sheetItemLabel}>Gerenciar jogo do clube</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      {clubGameAdmin.sheet}
    </Screen>
  );
}

const useStyles = themedStyles(colors => ({
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginBottom: spacing.md },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 14 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  flatList: { flex: 1 },
  list: { gap: spacing.md, paddingBottom: spacing.xxxl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 10, marginTop: spacing.sm },
  medal: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.zinc800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalGold: { backgroundColor: colors.amber400, borderColor: colors.amber300 },
  medalSilver: { backgroundColor: colors.zinc300, borderColor: colors.zinc400 },
  medalBronze: { backgroundColor: '#b3672b', borderColor: '#8a4e20' },
  medalText: { fontSize: 12, fontWeight: '900', color: colors.zinc300 },
  medalTextDark: { color: colors.amber950 },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
  },
  dateChipLabel: { fontSize: 11, fontWeight: '800', color: colors.zinc300 },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  card: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardLeader: { borderColor: 'rgba(251,191,36,0.3)', backgroundColor: 'rgba(251,191,36,0.05)' },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  cover: { width: 56, height: 76, borderRadius: radii.sm, backgroundColor: colors.zinc900 },
  info: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typography.h3, fontSize: 13, color: colors.foreground },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  points: { fontSize: 24, fontWeight: '900', color: colors.emerald400, marginTop: 4 },
  pointsUnit: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  moreButton: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceDeep },
  countsRow: { flexDirection: 'row', gap: spacing.sm },
  countChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceDeep,
  },
  countText: { fontSize: 11, fontWeight: '800', color: colors.zinc300 },
  myReason: { fontSize: 11, color: colors.red300, fontWeight: '600' },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    marginTop: spacing.md,
  },
  paginationLabel: { fontSize: 11, fontWeight: '700', color: colors.zinc300 },
  sheetBody: { padding: spacing.lg, gap: spacing.sm },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceSofter },
  sheetItemDisabled: { opacity: 0.6 },
  sheetItemLabel: { ...typography.small, color: colors.zinc300 },
  sheetItemLabelDone: { color: colors.emerald400 },
}));
