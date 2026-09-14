import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { EmptyState, LoadingState } from '@/components/StateViews';
import type { GameMugshot } from '@clube-do-jogo/domain';

export function MugshotsGrid({ mugshots, isLoading, avatarUrl, updatingAvatarUrl, title, onOpen, onChooseAvatar }: {
  mugshots: GameMugshot[];
  isLoading: boolean;
  avatarUrl?: string | null;
  updatingAvatarUrl?: string | null;
  title: string;
  onOpen: (index: number) => void;
  onChooseAvatar: (mugshot: GameMugshot) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  if (isLoading) return <LoadingState label="Carregando personagens…" />;
  if (!mugshots.length) return <EmptyState icon="people-outline" title="Sem personagens" description="A IGDB ainda não tem personagens associados a esse jogo." />;

  return (
    <View style={styles.grid}>
      {mugshots.map((mugshot, index) => {
        const selected = avatarUrl === mugshot.image_url;
        const updating = updatingAvatarUrl === mugshot.image_url;
        return (
          <View key={mugshot.id} style={styles.card}>
            <Pressable
              onPress={() => onOpen(index)}
              accessibilityRole="button"
              accessibilityLabel={`Ampliar retrato de ${mugshot.name}`}
              style={StyleSheet.absoluteFill}
            >
              <Image source={{ uri: mugshot.image_url }} style={styles.image} contentFit="cover" />
              <View style={styles.captionWrap}>
                <Text style={styles.caption} numberOfLines={1}>{mugshot.name}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => onChooseAvatar(mugshot)}
              disabled={updating}
              accessibilityRole="button"
              accessibilityLabel={selected ? `Ajustar o avatar ${mugshot.name}` : `Usar ${mugshot.name} como avatar`}
              style={[styles.avatarButton, selected && styles.avatarButtonSelected]}
            >
              <Ionicons name={selected ? 'checkmark' : 'person-outline'} size={14} color={colors.white} />
            </Pressable>
          </View>
        );
      })}
      <Text style={styles.footnote}>Personagens associados a {title} pela IGDB.</Text>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { width: '31%', aspectRatio: 1, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.zinc900 },
  image: { width: '100%', height: '100%' },
  captionWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.55)' },
  caption: { fontSize: 9, fontWeight: '800', color: colors.white },
  avatarButton: { position: 'absolute', right: 6, top: 6, width: 26, height: 26, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  avatarButtonSelected: { backgroundColor: colors.emerald500, borderColor: 'rgba(255,255,255,0.4)' },
  footnote: { ...typography.tiny, color: colors.zinc600, width: '100%', marginTop: spacing.xs },
}));
