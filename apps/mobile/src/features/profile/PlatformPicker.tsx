import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { UserPlatform } from '@clube-do-jogo/domain';
import { Sheet } from '@/components/Sheet';
import { EmptyState } from '@/components/StateViews';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAddUserPlatform, useRemoveUserPlatform, useSearchPlatforms, useUserPlatforms } from '@/state/profile-queries';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

export function PlatformPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 350);

  const ownedQuery = useUserPlatforms();
  const searchQuery = useSearchPlatforms(debouncedQuery);
  const addPlatform = useAddUserPlatform();
  const removePlatform = useRemoveUserPlatform();

  const owned = ownedQuery.data ?? [];
  const ownedIds = new Set(owned.map(platform => platform.igdb_platform_id));
  const results = (searchQuery.data ?? []).filter(platform => !ownedIds.has(platform.igdb_platform_id));

  return (
    <Sheet visible={visible} title="Minhas plataformas" onClose={onClose} avoidKeyboard>
      <View style={styles.content}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar plataforma…"
          placeholderTextColor={colors.zinc600}
          style={styles.input}
          accessibilityLabel="Buscar plataforma"
          returnKeyType="search"
        />

        {query.trim() ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resultados</Text>
            {searchQuery.isLoading ? (
              <ActivityIndicator color={colors.violet400} />
            ) : searchQuery.isError ? (
              <Text style={styles.error}>{searchQuery.error.message}</Text>
            ) : results.length ? (
              results.map(platform => (
                <PlatformRow
                  key={platform.igdb_platform_id}
                  platform={platform}
                  busy={addPlatform.isPending}
                  action={
                    <Pressable
                      onPress={() => addPlatform.mutate(platform)}
                      accessibilityRole="button"
                      accessibilityLabel={`Adicionar ${platform.name}`}
                      style={styles.iconButton}
                    >
                      <Ionicons name="add" size={18} color={colors.violet300} />
                    </Pressable>
                  }
                />
              ))
            ) : (
              <Text style={styles.emptyText}>Nenhuma plataforma encontrada.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suas plataformas</Text>
          {ownedQuery.isLoading ? (
            <ActivityIndicator color={colors.violet400} />
          ) : ownedQuery.isError ? (
            <Text style={styles.error}>{ownedQuery.error.message}</Text>
          ) : owned.length ? (
            owned.map(platform => (
              <PlatformRow
                key={platform.igdb_platform_id}
                platform={platform}
                busy={removePlatform.isPending}
                action={
                  <Pressable
                    onPress={() => removePlatform.mutate({ igdbPlatformId: platform.igdb_platform_id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${platform.name}`}
                    style={[styles.iconButton, styles.iconButtonDanger]}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.red300} />
                  </Pressable>
                }
              />
            ))
          ) : (
            <EmptyState icon="game-controller-outline" title="Nenhuma plataforma" description="Busque acima para adicionar." />
          )}
        </View>

        {addPlatform.error ? <Text style={styles.error}>{addPlatform.error.message}</Text> : null}
        {removePlatform.error ? <Text style={styles.error}>{removePlatform.error.message}</Text> : null}
      </View>
    </Sheet>
  );
}

function PlatformRow({ platform, action, busy }: { platform: UserPlatform; action: ReactNode; busy?: boolean }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        {platform.logo_url ? (
          <Image source={{ uri: platform.logo_url }} style={styles.logo} contentFit="contain" />
        ) : (
          <Ionicons name="game-controller-outline" size={18} color={colors.zinc400} />
        )}
      </View>
      <Text style={styles.rowLabel} numberOfLines={1}>{platform.name}</Text>
      {busy ? <ActivityIndicator size="small" color={colors.violet400} /> : action}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  content: { padding: spacing.lg, gap: spacing.lg },
  input: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 14,
  },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.tiny, color: colors.zinc500 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.hairlineSoft, backgroundColor: colors.surfaceSofter, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 26, height: 26 },
  rowLabel: { flex: 1, ...typography.small, color: colors.zinc300, fontWeight: '700' },
  iconButton: { width: 32, height: 32, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.12)' },
  iconButtonDanger: { backgroundColor: 'rgba(239,68,68,0.1)' },
  emptyText: { ...typography.small, color: colors.zinc600 },
  error: { color: colors.red300, fontSize: 11, fontWeight: '600' },
}));
