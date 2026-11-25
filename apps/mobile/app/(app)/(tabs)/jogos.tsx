import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Chip } from '@/components/Chip';
import { Sheet } from '@/components/Sheet';
import { DiscoverGameCard } from '@/components/DiscoverGameCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useApp } from '@/state/app-provider';
import { useBacklog, useLibrary, useRanking, useVote } from '@/state/queries';
import { useDiscoveryPages, type DiscoveryFilters } from '@/state/library-queries';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import type { DiscoverItem, DiscoverSource } from '@clube-do-jogo/domain';

const sources: Array<{ value: DiscoverSource; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'popular', label: 'Populares', icon: 'flame-outline' },
  { value: 'rated', label: 'Melhores notas', icon: 'star-outline' },
  { value: 'recent', label: 'Lançamentos', icon: 'sparkles-outline' },
  { value: 'anticipated', label: 'Em breve', icon: 'time-outline' },
];

const genres: Array<[number | null, string]> = [
  [null, 'Todos'],
  [12, 'RPG'],
  [31, 'Aventura'],
  [32, 'Indie'],
  [8, 'Plataforma'],
  [9, 'Puzzle'],
  [15, 'Estratégia'],
  [5, 'Tiro'],
];

type GridCell = DiscoverItem | { spacer: true };

function isSpacer(cell: GridCell): cell is { spacer: true } {
  return 'spacer' in cell;
}

const platforms: Array<[number | null, string]> = [
  [null, 'Todas'],
  [6, 'PC'],
  [167, 'PlayStation 5'],
  [169, 'Xbox Series'],
  [130, 'Nintendo Switch'],
];

export default function DiscoverScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const { isHistorical } = useApp();
  const [source, setSource] = usePersistentState<DiscoverSource>('clube-do-jogo:mobile:discover-source', 'popular');
  const [genre, setGenre] = usePersistentState<number | null>('clube-do-jogo:mobile:discover-genre', null);
  const [platform, setPlatform] = usePersistentState<number | null>('clube-do-jogo:mobile:discover-platform', null);
  const [yearDraft, setYearDraft] = usePersistentState<string>('clube-do-jogo:mobile:discover-year', '');
  const [draftSearch, setDraftSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<DiscoverItem | null>(null);
  const search = useDebouncedValue(draftSearch.trim(), 350);

  const year = useMemo(() => {
    const parsed = Number(yearDraft.trim());
    return yearDraft.trim() && Number.isFinite(parsed) ? parsed : undefined;
  }, [yearDraft]);

  const filters = useMemo<DiscoveryFilters>(() => ({
    search: search || undefined,
    genre: genre ?? undefined,
    platform: platform ?? undefined,
    year,
  }), [search, genre, platform, year]);

  const discoverQuery = useDiscoveryPages(source, filters);
  const libraryQuery = useLibrary();
  const backlog = useBacklog();
  const rankingQuery = useRanking();
  const vote = useVote();

  const libraryIds = useMemo(
    () => new Set((libraryQuery.data?.library ?? []).filter(item => item.inBacklog).map(item => item.game.id)),
    [libraryQuery.data],
  );
  // Ranking membership for the vote month: the library payload lists every voted
  // game, and the ranking cache carries optimistic votes made from here.
  const rankingIds = useMemo(() => new Set([
    ...(libraryQuery.data?.rankingGameIds ?? []),
    ...(rankingQuery.data ?? []).map(item => item.game.id),
  ]), [libraryQuery.data, rankingQuery.data]);
  const items = useMemo(() => discoverQuery.data?.pages.flatMap(page => page.items) ?? [], [discoverQuery.data]);
  // Pad odd lists so the last poster keeps the same width as the others.
  const cells = useMemo<GridCell[]>(() => (items.length % 2 ? [...items, { spacer: true }] : items), [items]);
  const activeFilterCount = [genre, platform, year].filter(value => value !== null && value !== undefined).length;
  const actionsInLibrary = actionsTarget ? libraryIds.has(actionsTarget.game.id) : false;
  const actionsInRanking = actionsTarget ? rankingIds.has(actionsTarget.game.id) : false;

  function openGame(gameId: string) {
    router.push({ pathname: '/(app)/jogos/[id]', params: { id: gameId } });
  }

  function addToMyGames(item: DiscoverItem) {
    setActionsTarget(null);
    if (libraryIds.has(item.game.id)) return;
    backlog.mutate({ gameId: item.game.id, inBacklog: true });
  }

  function addToRanking(item: DiscoverItem) {
    setActionsTarget(null);
    if (isHistorical || rankingIds.has(item.game.id)) return;
    vote.mutate({ gameId: item.game.id, game: item.game, choice: 'would_play' });
  }

  function loadMore() {
    if (discoverQuery.hasNextPage && !discoverQuery.isFetchingNextPage && !discoverQuery.isError) {
      void discoverQuery.fetchNextPage();
    }
  }

  function retryNextPage() {
    if (!discoverQuery.isFetchingNextPage) void discoverQuery.fetchNextPage();
  }

  function clearFilters() {
    setGenre(null);
    setPlatform(null);
    setYearDraft('');
  }

  return (
    <Screen scroll={false}>
      <FlatList
        style={styles.flatList}
        data={cells}
        numColumns={2}
        columnWrapperStyle={styles.column}
        keyExtractor={(cell: GridCell, index) => (isSpacer(cell) ? `spacer-${index}` : cell.game.id)}
        renderItem={({ item: cell }) => (
          isSpacer(cell) ? (
            <View style={styles.spacer} />
          ) : (
            <DiscoverGameCard
              item={cell}
              onOpen={() => openGame(cell.game.id)}
              onOptions={() => setActionsTarget(cell)}
            />
          )
        )}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshing={discoverQuery.isRefetching && !discoverQuery.isFetchingNextPage}
        onRefresh={() => discoverQuery.refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <AppHeader title="Explorar" subtitle="Descubra jogos para votar ou adicionar" />

            <View style={styles.searchRow}>
              <View style={styles.searchField}>
                <Ionicons name="search" size={16} color={colors.zinc600} />
                <TextInput
                  value={draftSearch}
                  onChangeText={setDraftSearch}
                  placeholder="Buscar jogos"
                  placeholderTextColor={colors.zinc600}
                  style={styles.searchInput}
                  accessibilityLabel="Buscar jogos"
                />
              </View>
              <Pressable
                onPress={() => setFiltersOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Filtros"
                style={styles.filterButton}
              >
                <Ionicons name="filter" size={16} color={colors.zinc300} />
                {activeFilterCount > 0 ? (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <View style={styles.chipsRow}>
              {sources.map(item => (
                <Chip key={item.value} label={item.label} icon={item.icon} selected={source === item.value} onPress={() => setSource(item.value)} />
              ))}
            </View>

            <View style={styles.countRow}>
              <Text style={styles.count}>{items.length} {items.length === 1 ? 'jogo' : 'jogos'}</Text>
              {activeFilterCount > 0 ? (
                <View style={styles.activeFilters} accessibilityLabel="Filtros ativos">
                  <Ionicons name="checkmark" size={12} color={colors.violet300} />
                  <Text style={styles.activeFiltersLabel}>Filtros ativos</Text>
                </View>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          discoverQuery.isLoading ? (
            <LoadingState label="Carregando jogos…" />
          ) : discoverQuery.isError ? (
            <ErrorState message={discoverQuery.error.message} onRetry={() => discoverQuery.refetch()} />
          ) : (
            <EmptyState icon="search-outline" title="Nenhum jogo encontrado" description="Tente outra busca ou categoria." />
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            discoverQuery.isFetchingNextPage ? (
              <LoadingState label="Carregando mais jogos…" />
            ) : discoverQuery.isError ? (
              <ErrorState message={discoverQuery.error.message} onRetry={retryNextPage} />
            ) : null
          ) : null
        }
      />

      {backlog.isError ? <Text style={styles.formError}>{backlog.error?.message}</Text> : null}
      {vote.isError ? <Text style={styles.formError}>{vote.error?.message}</Text> : null}

      <Sheet visible={Boolean(actionsTarget)} title={actionsTarget?.game.title ?? ''} onClose={() => setActionsTarget(null)}>
        {actionsTarget ? (
          <View style={styles.sheetBody}>
            <Pressable
              disabled={actionsInLibrary || backlog.isPending}
              onPress={() => addToMyGames(actionsTarget)}
              accessibilityRole="button"
              accessibilityState={{ disabled: actionsInLibrary }}
              accessibilityLabel={actionsInLibrary ? 'Em Meus Jogos' : 'Adicionar a Meus Jogos'}
              style={[styles.sheetItem, actionsInLibrary && styles.sheetItemDisabled]}
            >
              <Ionicons name={actionsInLibrary ? 'checkmark' : 'library-outline'} size={18} color={actionsInLibrary ? colors.emerald400 : colors.zinc400} />
              <Text style={[styles.sheetItemLabel, actionsInLibrary && styles.sheetItemLabelDone]}>
                {actionsInLibrary ? 'Em Meus Jogos' : 'Adicionar a Meus Jogos'}
              </Text>
            </Pressable>
            <Pressable
              disabled={actionsInRanking || isHistorical || vote.isPending}
              onPress={() => addToRanking(actionsTarget)}
              accessibilityRole="button"
              accessibilityState={{ disabled: actionsInRanking || isHistorical }}
              accessibilityLabel={actionsInRanking ? 'No ranking deste mês' : isHistorical ? 'Ranking encerrado, somente leitura' : 'Jogaria no ranking'}
              style={[styles.sheetItem, (actionsInRanking || isHistorical) && styles.sheetItemDisabled]}
            >
              <Ionicons
                name={actionsInRanking ? 'checkmark' : isHistorical ? 'time-outline' : 'trophy-outline'}
                size={18}
                color={actionsInRanking ? colors.emerald400 : isHistorical ? colors.amber400 : colors.zinc400}
              />
              <Text style={[styles.sheetItemLabel, actionsInRanking && styles.sheetItemLabelDone]}>
                {actionsInRanking ? 'No ranking deste mês' : isHistorical ? 'Ranking encerrado, somente leitura' : 'Jogaria no ranking'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}>
        <View style={styles.filterBody}>
          <Text style={styles.filterLabel}>Gênero</Text>
          <View style={styles.filterOptions}>
            {genres.map(([value, label]) => (
              <Chip key={label} label={label} selected={genre === value} onPress={() => setGenre(value)} />
            ))}
          </View>

          <Text style={styles.filterLabel}>Plataforma</Text>
          <View style={styles.filterOptions}>
            {platforms.map(([value, label]) => (
              <Chip key={label} label={label} selected={platform === value} onPress={() => setPlatform(value)} />
            ))}
          </View>

          <Text style={styles.filterLabel}>Ano</Text>
          <TextInput
            value={yearDraft}
            onChangeText={setYearDraft}
            placeholder="Todos"
            placeholderTextColor={colors.zinc600}
            keyboardType="number-pad"
            style={styles.yearInput}
            accessibilityLabel="Ano de lançamento"
          />

          {activeFilterCount > 0 ? (
            <Pressable onPress={clearFilters} accessibilityRole="button" accessibilityLabel="Limpar filtros" style={styles.clearButton}>
              <Text style={styles.clearButtonLabel}>Limpar filtros</Text>
            </Pressable>
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}

const useStyles = themedStyles(colors => ({
  flatList: { flex: 1 },
  list: { paddingBottom: spacing.xxxl, gap: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 14 },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: radii.full,
    backgroundColor: colors.violet500,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: '900', color: colors.white },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  count: { ...typography.tiny, color: colors.zinc600 },
  activeFilters: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeFiltersLabel: { fontSize: 10, fontWeight: '700', color: colors.violet300 },
  column: { gap: spacing.sm },
  spacer: { flex: 1 },
  sheetBody: { padding: spacing.lg, gap: spacing.sm },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceSofter },
  sheetItemDisabled: { opacity: 0.6 },
  sheetItemLabel: { ...typography.small, color: colors.zinc300 },
  sheetItemLabelDone: { color: colors.emerald400 },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  filterBody: { padding: spacing.lg, gap: spacing.sm },
  filterLabel: { ...typography.small, color: colors.zinc400, fontWeight: '800', marginTop: spacing.sm },
  filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  yearInput: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    color: colors.foreground,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  clearButton: { height: 44, borderRadius: radii.md, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  clearButtonLabel: { fontSize: 12, fontWeight: '800', color: colors.zinc400 },
}));
