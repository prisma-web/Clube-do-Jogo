import { useMemo, useState } from 'react';
import { ScrollView, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameListRow } from './GameListRow';
import { Sheet } from './Sheet';
import { ErrorState, LoadingState } from './StateViews';
import { useDiscoveryPages } from '@/state/library-queries';
import { useBacklog } from '@/state/queries';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { radii, spacing, themedStyles, useThemeColors, typography } from '@/theme';
import type { DiscoverItem } from '@clube-do-jogo/domain';

export function AddGameToLibrarySheet({ visible, onClose, libraryIds }: {
  visible: boolean;
  onClose: () => void;
  libraryIds: Set<string>;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const backlog = useBacklog();
  const [draftSearch, setDraftSearch] = useState('');
  const search = useDebouncedValue(draftSearch.trim(), 350);
  const hasQuery = Boolean(search);

  const discoverQuery = useDiscoveryPages('popular', { search: search || undefined });

  const games = useMemo(() => {
    if (!hasQuery) return [];
    const items: DiscoverItem[] = discoverQuery.data?.pages.flatMap(page => page.items) ?? [];
    return items.map(item => item.game);
  }, [discoverQuery.data, hasQuery]);

  return (
    <Sheet visible={visible} title="Adicionar a Meus Jogos" onClose={onClose} avoidKeyboard>
      <View style={styles.body}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={16} color={colors.zinc600} />
          <TextInput
            value={draftSearch}
            onChangeText={setDraftSearch}
            placeholder="Nome do jogo"
            placeholderTextColor={colors.zinc600}
            style={styles.searchInput}
            accessibilityLabel="Nome do jogo"
            autoFocus
          />
        </View>

        <ScrollView style={styles.results} contentContainerStyle={styles.resultsContent} keyboardShouldPersistTaps="handled">
          {!hasQuery ? (
            <Text style={styles.emptyText}>Busque pelo nome do jogo.</Text>
          ) : discoverQuery.isLoading ? (
            <LoadingState />
          ) : discoverQuery.isError ? (
            <ErrorState message={discoverQuery.error.message} onRetry={() => discoverQuery.refetch()} />
          ) : games.length === 0 ? (
            <Text style={styles.emptyText}>Busque pelo nome do jogo.</Text>
          ) : (
            games.map(game => {
              const inLibrary = libraryIds.has(game.id);
              return (
                <GameListRow
                  key={game.id}
                  game={game}
                  action={
                    <Pressable
                      disabled={inLibrary || backlog.isPending}
                      onPress={() => backlog.mutate({ gameId: game.id, inBacklog: true })}
                      accessibilityRole="button"
                      accessibilityLabel={inLibrary ? `${game.title} já está em Meus Jogos` : `Adicionar ${game.title} a Meus Jogos`}
                      style={[styles.addButton, inLibrary && styles.addButtonDone]}
                    >
                      <Ionicons name={inLibrary ? 'checkmark' : 'add'} size={14} color={inLibrary ? colors.emerald400 : colors.violet300} />
                    </Pressable>
                  }
                />
              );
            })
          )}
        </ScrollView>
        {backlog.isError ? <Text style={styles.formError}>{backlog.error?.message}</Text> : null}
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  body: { padding: spacing.lg, gap: spacing.md },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 14 },
  results: { maxHeight: 420 },
  resultsContent: { gap: spacing.sm },
  emptyText: { ...typography.small, color: colors.zinc500, textAlign: 'center', paddingVertical: spacing.xxl },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  addButtonDone: { backgroundColor: 'rgba(16,185,129,0.15)' },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600' },
}));
