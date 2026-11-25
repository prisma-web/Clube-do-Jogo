import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GotyPersonalCategory, GotySearchGameResult } from '@clube-do-jogo/domain';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGotyGameSearch } from '@/state/goty-queries';
import { gotyColors, gotyShared } from './goty-theme';
import { GotyPosterArt } from './GotyPosterArt';
import { GotyPill, GotySheet } from './GotyUi';

export function GotyGamePickerSheet({
  category,
  selectedTitle,
  onClose,
  onSelect,
}: {
  category: GotyPersonalCategory | null;
  selectedTitle?: string | null;
  onClose: () => void;
  onSelect: (game: GotySearchGameResult) => Promise<boolean>;
}) {
  const open = Boolean(category);
  const [draftQuery, setDraftQuery] = useState('');
  const [includeAllYears, setIncludeAllYears] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(draftQuery.trim(), 260);
  const search = useGotyGameSearch({ query: debouncedQuery, includeAllYears, enabled: open });

  function close() {
    setDraftQuery('');
    setIncludeAllYears(false);
    setSavingId(null);
    onClose();
  }

  const results = search.data?.items ?? [];
  const fallbackError = search.data?.fallbackError ?? null;
  const loading = search.isPending || (search.isFetching && search.isPlaceholderData);

  async function handleChoose(game: GotySearchGameResult) {
    setSavingId(game.id);
    try {
      const ok = await onSelect(game);
      if (ok) close();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <GotySheet
      visible={open}
      onClose={close}
      title={category ? `Escolher jogo · ${category.name}` : 'Escolher jogo de 2026'}
      description={category?.description}
      avoidKeyboard
      fullHeight
    >
      <View style={styles.controls}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#b8a574" />
          <TextInput
            value={draftQuery}
            onChangeText={setDraftQuery}
            placeholder="Buscar jogos de 2026 (ex: GTA VI, Cairn…)"
            placeholderTextColor="#8d8267"
            style={styles.searchInput}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Buscar jogos lançados em 2026"
          />
          {search.isFetching ? <ActivityIndicator size="small" color={gotyColors.goldStrong} /> : null}
        </View>

        <View style={styles.toggleRow}>
          <GotyPill
            icon="calendar"
            label={includeAllYears ? 'Mostrando 2026 e outros anos' : 'Priorizando lançamentos de 2026'}
            style={styles.flexShrink}
          />
          <View style={styles.toggle}>
            <Text style={styles.toggleLabel}>Incluir outros anos</Text>
            <Switch
              value={includeAllYears}
              onValueChange={setIncludeAllYears}
              trackColor={{ false: '#3f3a2e', true: '#b8913a' }}
              thumbColor={includeAllYears ? '#f4df9a' : '#a79c82'}
              accessibilityLabel="Incluir outros anos (exceção)"
            />
          </View>
        </View>

        {fallbackError ? (
          <Text style={styles.fallback}>{fallbackError} Exibindo catálogo curado de 2026.</Text>
        ) : null}
      </View>

      {loading && results.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={gotyColors.goldStrong} />
          <Text style={styles.centerText}>Verificando lançamentos comerciais de 2026…</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="sparkles" size={24} color="#c4a657" />
          <Text style={styles.emptyTitle}>Nenhum lançamento comercial de 2026 encontrado</Text>
          <Text style={styles.centerText}>
            Tente outro título ou ative “Incluir outros anos” se a data comercial do jogo ainda não estiver catalogada na IGDB.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={game => `${game.id}:${game.igdb_id ?? ''}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item: game }) => {
            const isCurrent = selectedTitle?.toLowerCase() === game.title.toLowerCase();
            const isSaving = savingId === game.id;
            const meta = [...(game.genres || []).slice(0, 2), ...(game.platforms || []).slice(0, 2)].join(' · ');
            return (
              <Pressable
                onPress={() => void handleChoose(game)}
                disabled={Boolean(savingId)}
                accessibilityRole="button"
                accessibilityLabel={`Escolher ${game.title}${isCurrent ? ', escolha atual' : ''}`}
                style={({ pressed }) => [styles.result, isCurrent && styles.resultCurrent, Boolean(savingId) && !isSaving && gotyShared.disabled, pressed && gotyShared.pressed]}
              >
                <GotyPosterArt title={game.title} imageUrl={game.image_url} compact style={styles.resultPoster} />
                <View style={styles.flex1}>
                  <View style={styles.resultTop}>
                    <Text style={styles.resultTitle} numberOfLines={2}>{game.title}</Text>
                    {isSaving ? (
                      <ActivityIndicator size="small" color={gotyColors.goldStrong} />
                    ) : isCurrent ? (
                      <View style={styles.currentBadge}>
                        <Ionicons name="checkmark" size={12} color={gotyColors.onGold} />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.resultTags}>
                    <GotyPill tone={game.is_eligible_2026 ? 'gold' : 'muted'} label={game.eligibility_label} />
                    {game.average_rating != null ? (
                      <View style={styles.rating}>
                        <Ionicons name="star" size={10} color={gotyColors.goldStrong} />
                        <Text style={styles.ratingText}>{game.average_rating}</Text>
                      </View>
                    ) : null}
                  </View>
                  {meta ? <Text style={styles.resultMeta} numberOfLines={1}>{meta}</Text> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </GotySheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  controls: {
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: gotyColors.goldBorderSoft,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: '#14131a',
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: '#fdf8e8', fontSize: 14, paddingVertical: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleLabel: { color: '#b9ae92', fontSize: 12, fontWeight: '700' },
  fallback: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: gotyColors.amberBorder,
    backgroundColor: gotyColors.amberTint,
    color: gotyColors.amberText,
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  centerText: { color: '#a89c7f', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  emptyTitle: { color: '#f6ecd0', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  list: { padding: 14, gap: 8 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.15)',
    backgroundColor: '#121118',
    padding: 10,
  },
  resultCurrent: { borderColor: gotyColors.goldBorderStrong, backgroundColor: '#181620' },
  resultPoster: { width: 56, height: 78, borderRadius: 10, borderWidth: 1, borderColor: gotyColors.hairline },
  resultTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  resultTitle: { flex: 1, color: '#faf4e4', fontSize: 13, fontWeight: '800', lineHeight: 17 },
  currentBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: gotyColors.goldStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTags: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: '#c9b98d', fontSize: 11, fontWeight: '700' },
  resultMeta: { color: '#958a72', fontSize: 11, marginTop: 5 },
});
