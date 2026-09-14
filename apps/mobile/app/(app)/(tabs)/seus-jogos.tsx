import { useMemo, useState } from 'react';
import { FlatList, Pressable, SectionList, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Chip } from '@/components/Chip';
import { GameListRow } from '@/components/GameListRow';
import { StatusPill } from '@/components/StatusPill';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { PlatformPicker } from '@/features/profile/PlatformPicker';
import { AddGameToLibrarySheet } from '@/components/AddGameToLibrarySheet';
import { useBacklog, useFavorite, useLibrary, useSetProgress } from '@/state/queries';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { selectLibraryGames, type LibraryGame, type LibraryQuickFilter, type LibrarySortMode, type ProgressStatus } from '@clube-do-jogo/domain';

type QuickFilter = LibraryQuickFilter;
type SortMode = LibrarySortMode;

const quickFilters: Array<{ value: QuickFilter; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'all', label: 'Todos', icon: 'albums-outline' },
  { value: 'started', label: 'Comecei', icon: 'play-outline' },
  { value: 'finished', label: 'Finalizados', icon: 'flag-outline' },
  { value: 'not_started', label: 'Não iniciados', icon: 'ellipse-outline' },
  { value: 'favorites', label: 'Favoritos', icon: 'heart-outline' },
];

const sortOptions: Array<[SortMode, string]> = [
  ['updated_desc', 'Atualizados recentemente'],
  ['updated_asc', 'Atualizados há mais tempo'],
  ['title_asc', 'Título: A–Z'],
  ['title_desc', 'Título: Z–A'],
  ['duration_asc', 'Menor duração'],
  ['duration_desc', 'Maior duração'],
  ['rating_desc', 'Maior nota'],
  ['rating_asc', 'Menor nota'],
];

const statusLabel: Record<ProgressStatus, string> = { not_started: 'Não iniciado', started: 'Comecei', finished: 'Finalizado' };

const filterToggles: Array<{ key: 'playableOnly' | 'shortOnly' | 'ratedOnly'; label: string }> = [
  { key: 'playableOnly', label: 'Nos meus consoles' },
  { key: 'shortOnly', label: 'Até 12 horas' },
  { key: 'ratedOnly', label: 'Com nota' },
];

export default function YourGamesScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const libraryQuery = useLibrary();
  const backlog = useBacklog();
  const favorite = useFavorite();
  const setProgress = useSetProgress();
  const [quickFilter, setQuickFilter] = usePersistentState<QuickFilter>('clube-do-jogo:mobile:library-quick-filter', 'all');
  const [sortMode, setSortMode] = usePersistentState<SortMode>('clube-do-jogo:mobile:library-sort', 'updated_desc');
  const [playableOnly, setPlayableOnly] = usePersistentState('clube-do-jogo:mobile:library-playable', false);
  const [shortOnly, setShortOnly] = usePersistentState('clube-do-jogo:mobile:library-short', false);
  const [ratedOnly, setRatedOnly] = usePersistentState('clube-do-jogo:mobile:library-rated', false);
  const [grouped, setGrouped] = usePersistentState('clube-do-jogo:mobile:library-grouped', false);
  const [search, setSearch] = useState('');
  const [actionsTarget, setActionsTarget] = useState<LibraryGame | null>(null);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [platformsOpen, setPlatformsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<LibraryGame | null>(null);

  const filterValues: Record<'playableOnly' | 'shortOnly' | 'ratedOnly', boolean> = { playableOnly, shortOnly, ratedOnly };
  const filterSetters: Record<'playableOnly' | 'shortOnly' | 'ratedOnly', (value: boolean) => void> = {
    playableOnly: setPlayableOnly,
    shortOnly: setShortOnly,
    ratedOnly: setRatedOnly,
  };

  const ownedPlatformIds = useMemo(
    () => new Set((libraryQuery.data?.platforms ?? []).map(platform => platform.igdb_platform_id)),
    [libraryQuery.data?.platforms],
  );

  const visible = useMemo(() => selectLibraryGames(
    libraryQuery.data?.library ?? [],
    { quickFilter, text: search, sortMode, playableOnly, shortOnly, ratedOnly },
    ownedPlatformIds,
  ), [libraryQuery.data?.library, ownedPlatformIds, playableOnly, quickFilter, ratedOnly, search, shortOnly, sortMode]);

  const libraryIds = useMemo(
    () => new Set((libraryQuery.data?.library ?? []).filter(item => item.inBacklog).map(item => item.game.id)),
    [libraryQuery.data?.library],
  );

  const sections = useMemo<Array<{ status: ProgressStatus | null; title: string | null; data: LibraryGame[] }>>(() => grouped
    ? (['started', 'not_started', 'finished'] as ProgressStatus[])
      .map(status => ({ status, title: statusLabel[status], data: visible.filter(item => (item.progress?.status ?? 'not_started') === status) }))
      .filter(section => section.data.length > 0)
    : [{ status: null, title: null, data: visible }],
    [grouped, visible]);

  function toggleFavorite(item: LibraryGame) {
    favorite.mutate({ gameId: item.game.id, favorite: !item.favorite });
  }

  function changeStatus(item: LibraryGame, status: ProgressStatus) {
    setActionsTarget(null);
    setProgress.mutate({ gameId: item.game.id, status });
  }

  function requestRemoveFromLibrary(item: LibraryGame) {
    setActionsTarget(null);
    setRemoveTarget(item);
  }

  function confirmRemoveFromLibrary() {
    if (!removeTarget) return;
    backlog.mutate({ gameId: removeTarget.game.id, inBacklog: false });
    setRemoveTarget(null);
  }

  const mutationError = backlog.error || favorite.error || setProgress.error;

  return (
    <Screen scroll={false}>
      <SectionList
        style={styles.flatList}
        sections={sections}
        keyExtractor={item => item.game.id}
        renderSectionHeader={({ section }) => section.title ? <Text style={styles.sectionHeader}>{section.title}</Text> : null}
        renderItem={({ item }) => {
          const status = item.progress?.status ?? 'not_started';
          return (
            <GameListRow
              game={item.game}
              onPress={() => router.push({ pathname: '/(app)/jogos/[id]', params: { id: item.game.id } })}
              subtitle={<StatusPill status={status} />}
              action={
                <View style={styles.actionsColumn}>
                  {item.favorite ? <Ionicons name="heart" size={16} color={colors.pink400} /> : null}
                  <Pressable
                    onPress={() => setActionsTarget(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Opções de ${item.game.title}`}
                    style={styles.moreButton}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color={colors.zinc400} />
                  </Pressable>
                </View>
              }
            />
          );
        }}
        contentContainerStyle={styles.list}
        refreshing={libraryQuery.isRefetching}
        onRefresh={() => libraryQuery.refetch()}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <AppHeader
              title="Meus jogos"
              subtitle="Sua biblioteca pessoal"
              right={
                <View style={styles.headerActions}>
                  <Pressable
                    onPress={() => setPlatformsOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Gerenciar consoles"
                    style={styles.platformsButton}
                  >
                    <Ionicons name="game-controller-outline" size={18} color={colors.violet300} />
                  </Pressable>
                  <Pressable
                    onPress={() => setAddOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Adicionar"
                    style={styles.addPill}
                  >
                    <Ionicons name="add" size={16} color={colors.white} />
                    <Text style={styles.addPillLabel}>Adicionar</Text>
                  </Pressable>
                </View>
              }
            />

            <View style={styles.searchField}>
              <Ionicons name="search" size={16} color={colors.zinc600} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar nos seus jogos"
                placeholderTextColor={colors.zinc600}
                style={styles.searchInput}
                accessibilityLabel="Buscar nos seus jogos"
              />
            </View>

            <View style={styles.chipsRow}>
              {quickFilters.map(item => (
                <Chip key={item.value} label={item.label} icon={item.icon} selected={quickFilter === item.value} onPress={() => setQuickFilter(item.value)} />
              ))}
            </View>

            <View style={styles.countRow}>
              <Text style={styles.count}>{visible.length} {visible.length === 1 ? 'jogo' : 'jogos'}</Text>
              <View style={styles.countRowActions}>
                <Pressable
                  onPress={() => setFilterSheetOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Filtros"
                  style={styles.sortButton}
                >
                  <Ionicons name="filter-outline" size={13} color={colors.zinc300} />
                  <Text style={styles.sortButtonLabel}>Filtros</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSortSheetOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Ordenar"
                  style={styles.sortButton}
                >
                  <Ionicons name="swap-vertical" size={13} color={colors.zinc300} />
                  <Text style={styles.sortButtonLabel}>Ordenar</Text>
                </Pressable>
              </View>
            </View>
            {mutationError ? <Text style={styles.formError}>{mutationError.message}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          libraryQuery.isLoading ? (
            <LoadingState label="Carregando sua biblioteca…" />
          ) : libraryQuery.isError ? (
            <ErrorState message={libraryQuery.error.message} onRetry={() => libraryQuery.refetch()} />
          ) : (
            <EmptyState icon="library-outline" title="Nenhum jogo encontrado" description="Toque em Adicionar para buscar um jogo." />
          )
        }
      />

      <Sheet visible={sortSheetOpen} title="Ordenar" onClose={() => setSortSheetOpen(false)}>
        <FlatList
          data={sortOptions}
          keyExtractor={([value]) => value}
          contentContainerStyle={styles.sheetBody}
          renderItem={({ item: [value, label] }) => (
            <Pressable
              onPress={() => { setSortMode(value); setSortSheetOpen(false); }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: sortMode === value }}
              style={[styles.sheetItem, sortMode === value && styles.sheetItemSelected]}
            >
              <Text style={styles.sheetItemLabel}>{label}</Text>
              {sortMode === value ? <Ionicons name="checkmark" size={16} color={colors.violet300} /> : null}
            </Pressable>
          )}
        />
      </Sheet>

      <Sheet visible={filterSheetOpen} title="Filtros" onClose={() => setFilterSheetOpen(false)}>
        <View style={styles.sheetBody}>
          {filterToggles.map(({ key, label }) => (
            <View key={key} style={[styles.sheetItem, styles.sheetItemToggle]}>
              <Text style={styles.sheetItemLabel}>{label}</Text>
              <Switch
                value={filterValues[key]}
                onValueChange={value => filterSetters[key](value)}
                accessibilityLabel={label}
              />
            </View>
          ))}
          <View style={[styles.sheetItem, styles.sheetItemToggle]}>
            <Text style={styles.sheetItemLabel}>Agrupar por status</Text>
            <Switch
              value={grouped}
              onValueChange={setGrouped}
              accessibilityLabel="Agrupar por status"
            />
          </View>
        </View>
      </Sheet>

      <AddGameToLibrarySheet visible={addOpen} onClose={() => setAddOpen(false)} libraryIds={libraryIds} />

      <Sheet visible={Boolean(actionsTarget)} title={actionsTarget?.game.title ?? ''} onClose={() => setActionsTarget(null)}>
        {actionsTarget ? (
          <View style={styles.sheetBody}>
            <Pressable
              onPress={() => toggleFavorite(actionsTarget)}
              accessibilityRole="button"
              accessibilityLabel={actionsTarget.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              style={styles.sheetItem}
            >
              <Ionicons name={actionsTarget.favorite ? 'heart' : 'heart-outline'} size={18} color={colors.pink400} />
              <Text style={styles.sheetItemLabel}>{actionsTarget.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}</Text>
            </Pressable>
            {(['not_started', 'started', 'finished'] as ProgressStatus[]).map(status => (
              <Pressable
                key={status}
                disabled={(actionsTarget.progress?.status ?? 'not_started') === status}
                onPress={() => changeStatus(actionsTarget, status)}
                accessibilityRole="button"
                accessibilityLabel={`Marcar como ${statusLabel[status]}`}
                style={[styles.sheetItem, (actionsTarget.progress?.status ?? 'not_started') === status && styles.sheetItemDisabled]}
              >
                <Ionicons name="flag-outline" size={18} color={colors.zinc400} />
                <Text style={styles.sheetItemLabel}>Marcar como {statusLabel[status]}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => requestRemoveFromLibrary(actionsTarget)}
              accessibilityRole="button"
              accessibilityLabel="Remover de Meus Jogos"
              style={[styles.sheetItem, styles.sheetItemDanger]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.red300} />
              <Text style={[styles.sheetItemLabel, styles.sheetItemDangerLabel]}>Remover de Meus Jogos</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={Boolean(removeTarget)} title="Remover de Meus Jogos" onClose={() => setRemoveTarget(null)}>
        <View style={styles.sheetBody}>
          <Text style={styles.confirmText}>{removeTarget?.game.title}</Text>
          <View style={styles.confirmActions}>
            <Pressable
              onPress={() => setRemoveTarget(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              style={styles.confirmButton}
            >
              <Text style={styles.confirmButtonLabel}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={confirmRemoveFromLibrary}
              accessibilityRole="button"
              accessibilityLabel="Remover"
              style={[styles.confirmButton, styles.confirmButtonDanger]}
            >
              <Text style={[styles.confirmButtonLabel, styles.confirmButtonDangerLabel]}>Remover</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>

      <PlatformPicker visible={platformsOpen} onClose={() => setPlatformsOpen(false)} />
    </Screen>
  );
}

const useStyles = themedStyles(colors => ({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.violet600,
  },
  addPillLabel: { fontSize: 11, fontWeight: '800', color: colors.white },
  sectionHeader: { ...typography.tiny, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.zinc500, marginBottom: spacing.sm, marginTop: spacing.sm },
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
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  countRowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { ...typography.tiny, color: colors.zinc600 },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: spacing.md, borderRadius: radii.full, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter },
  sortButtonLabel: { fontSize: 11, fontWeight: '700', color: colors.zinc300 },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginBottom: spacing.md },
  flatList: { flex: 1 },
  list: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  actionsColumn: { alignItems: 'center', gap: spacing.sm },
  moreButton: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceDeep },
  sheetBody: { padding: spacing.lg, gap: spacing.sm },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceSofter },
  sheetItemSelected: { backgroundColor: 'rgba(139,92,246,0.15)', justifyContent: 'space-between' },
  sheetItemToggle: { justifyContent: 'space-between' },
  sheetItemDisabled: { opacity: 0.4 },
  sheetItemLabel: { ...typography.small, color: colors.zinc300 },
  sheetItemDanger: { backgroundColor: 'rgba(239,68,68,0.08)' },
  sheetItemDangerLabel: { color: colors.red300 },
  platformsButton: { width: 40, height: 40, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  confirmText: { ...typography.small, color: colors.zinc400 },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
  confirmButton: { flex: 1, height: 44, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSofter },
  confirmButtonLabel: { ...typography.small, fontWeight: '700', color: colors.foreground },
  confirmButtonDanger: { backgroundColor: colors.red600 },
  confirmButtonDangerLabel: { color: '#fff' },
}));
