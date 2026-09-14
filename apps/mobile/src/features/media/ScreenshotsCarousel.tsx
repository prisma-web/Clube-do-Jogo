import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { themedStyles, useThemeColors, radii, spacing } from '@/theme';

export function ScreenshotsCarousel({ title, images, avatarUrl, updatingAvatarUrl, onOpen, onChooseAvatar }: {
  title: string;
  images: string[];
  avatarUrl?: string | null;
  updatingAvatarUrl?: string | null;
  onOpen: (index: number) => void;
  onChooseAvatar?: (url: string) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  if (!images.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {images.map((url, index) => {
        const selected = avatarUrl === url;
        const updating = updatingAvatarUrl === url;
        return (
          <View key={`${url}-${index}`} style={styles.card}>
            <Pressable
              onPress={() => onOpen(index)}
              accessibilityRole="button"
              accessibilityLabel={`Abrir imagem ${index + 1} de ${title}`}
              style={StyleSheet.absoluteFill}
            >
              <Image source={{ uri: url }} style={styles.image} contentFit="cover" />
            </Pressable>
            {onChooseAvatar ? (
              <Pressable
                onPress={() => onChooseAvatar(url)}
                disabled={updating}
                accessibilityRole="button"
                accessibilityLabel={selected ? 'Ajustar enquadramento do avatar atual' : 'Usar imagem como avatar'}
                style={[styles.avatarButton, selected && styles.avatarButtonSelected]}
              >
                <Ionicons name={selected ? 'checkmark' : 'person-outline'} size={16} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const useStyles = themedStyles(colors => ({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  card: { width: 220, height: 132, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.zinc900 },
  image: { width: '100%', height: '100%' },
  avatarButton: { position: 'absolute', right: spacing.xs, top: spacing.xs, width: 32, height: 32, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  avatarButtonSelected: { backgroundColor: colors.emerald500, borderColor: 'rgba(255,255,255,0.4)' },
}));
