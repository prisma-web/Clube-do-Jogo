import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { UserPlatform } from '@clube-do-jogo/domain';
import { radii, spacing, themedStyles } from '@/theme';
import { PLATFORM_FAMILY_COLORS, platformFamily, type PlatformFamily } from './platform-family';

const FALLBACK_ICONS: Record<PlatformFamily, keyof typeof Ionicons.glyphMap> = {
  playstation: 'logo-playstation',
  xbox: 'logo-xbox',
  nintendo: 'game-controller-outline',
  pc: 'desktop-outline',
  other: 'radio-outline',
};

export function PlatformCard({ platform }: { platform: UserPlatform }) {
  const styles = useStyles();
  const family = platformFamily(platform);
  const accent = PLATFORM_FAMILY_COLORS[family];
  return (
    <View
      style={[styles.card, { borderColor: `${accent}47`, backgroundColor: `${accent}14` }]}
      accessible
      accessibilityLabel={platform.abbreviation ? `${platform.name} (${platform.abbreviation})` : platform.name}
    >
      <View style={[styles.glow, { backgroundColor: accent }]} />
      <View style={[styles.iconBox, { backgroundColor: `${accent}29` }]}>
        {platform.logo_url ? (
          <Image
            source={{ uri: platform.logo_url }}
            style={styles.logo}
            contentFit="contain"
            tintColor="#ffffff"
          />
        ) : (
          <Ionicons name={FALLBACK_ICONS[family]} size={24} color={accent} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{platform.name}</Text>
        {platform.abbreviation ? <Text style={styles.abbr} numberOfLines={1}>{platform.abbreviation}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  card: {
    width: '48%',
    minHeight: 112,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  glow: {
    position: 'absolute',
    top: -40,
    right: -32,
    width: 112,
    height: 112,
    borderRadius: radii.full,
    opacity: 0.14,
  },
  iconBox: { width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 36, height: 32, opacity: 0.88 },
  info: { marginTop: spacing.md, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '800', color: colors.foreground },
  abbr: { marginTop: 2, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.zinc500 },
}));
