import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameListRow } from './GameListRow';
import { PreferenceButtons } from './PreferenceButtons';
import { Sheet } from './Sheet';
import { ErrorState, LoadingState } from './StateViews';
import { useGameSearch } from '@/state/queries';
import { normalizeSearchQuery } from '@clube-do-jogo/data';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { radii, spacing, themedStyles, useThemeColors, typography } from '@/theme';
import type { Game, RankingItem, VoteChoice } from '@clube-do-jogo/domain';

export function AddGameToVoteSheet({ visible, onClose, ranking, onChoose }: {
  visible: boolean;
  onClose: () => void;
  ranking: RankingItem[];
  onChoose: (game: Game, choice: VoteChoice) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [draftSearch, setDraftSearch] = useState('');
  const search = useDebouncedValue(normalizeSearchQuery(draftSearch), 350);
  const hasQuery = Boolean(search);

  const searchQuery = useGameSearch(search);
  const games = useMemo(() => (hasQuery ? searchQuery.data ?? [] : []), [hasQuery, searchQuery.data]);

  return (
    <Sheet visible={visible} title="Adicionar jogo à votação" onClose={onClose} avoidKeyboard>
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
          ) : searchQuery.isLoading ? (
            <LoadingState />
          ) : searchQuery.isError ? (
            <ErrorState message={searchQuery.error.message} onRetry={() => searchQuery.refetch()} />
          ) : games.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum jogo encontrado.</Text>
          ) : (
            games.map(game => {
              const existing = ranking.find(item => item.game.id === game.id);
              return (
                <View key={game.id} style={styles.resultCard}>
                  <GameListRow game={game} />
                  <PreferenceButtons
                    value={existing?.myChoice ?? null}
                    onChange={choice => onChoose(game, choice)}
                  />
                </View>
              );
            })
          )}
        </ScrollView>
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
  resultCard: { gap: spacing.sm },
  emptyText: { ...typography.small, color: colors.zinc500, textAlign: 'center', paddingVertical: spacing.xxl },
}));
