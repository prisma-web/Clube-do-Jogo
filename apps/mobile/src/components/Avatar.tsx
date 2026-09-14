import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { radii, themedStyles } from '@/theme';
import { initials } from '@/lib/format';
import { normalizeAvatarCrop, type AvatarCrop } from '@clube-do-jogo/domain';

export function Avatar({ uri, crop, name, size = 40 }: {
  uri?: string | null;
  crop?: Partial<AvatarCrop> | null;
  name?: string | null;
  size?: number;
}) {
  const styles = useStyles();
  const dimension = { width: size, height: size, borderRadius: radii.full };
  if (uri) {
    const normalized = normalizeAvatarCrop(crop);
    return (
      <View style={[styles.imageClip, dimension]}>
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { transform: [{ scale: normalized.zoom }], transformOrigin: `${normalized.x}% ${normalized.y}%` }]}
          contentFit="cover"
          contentPosition={{ top: `${normalized.y}%`, left: `${normalized.x}%` }}
          accessibilityLabel={`Avatar de ${name || 'membro'}`}
        />
      </View>
    );
  }
  return (
    <View style={[styles.fallback, dimension]} accessibilityLabel={`Avatar de ${name || 'membro'}`}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  imageClip: { overflow: 'hidden', backgroundColor: colors.zinc800 },
  fallback: { backgroundColor: colors.zinc800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline },
  initials: { color: colors.zinc300, fontWeight: '800' },
}));
