import { memo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { GotyNomineeKind } from '@clube-do-jogo/domain';
import { hashString, monogram } from './goty-logic';
import { gotyColors } from './goty-theme';
import { TgaEmblem } from './TgaEmblem';

const POSTER_PALETTES = ['#261f12', '#1e1a24', '#251814', '#131e22', '#211d13', '#1c1a15'] as const;

const KIND_ICONS: Record<GotyNomineeKind, keyof typeof Ionicons.glyphMap> = {
  game: 'game-controller',
  performance: 'mic',
  adaptation: 'film',
  creator: 'sparkles',
  esports_athlete: 'trophy',
  esports_team: 'trophy',
  user_creation: 'people',
};

export const GotyPosterArt = memo(function GotyPosterArt({
  title,
  subtitle,
  imageUrl,
  kind = 'game',
  compact = false,
  style,
}: {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  kind?: GotyNomineeKind;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && failedUrl !== imageUrl);

  if (showImage && imageUrl) {
    return (
      <View style={[styles.frame, style]}>
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          onError={() => setFailedUrl(imageUrl)}
          accessibilityLabel={title}
        />
        <View style={styles.imageShade} pointerEvents="none" />
      </View>
    );
  }

  const background = POSTER_PALETTES[hashString(title) % POSTER_PALETTES.length];

  return (
    <View
      style={[styles.frame, styles.editorial, { backgroundColor: background }, compact && styles.editorialCompact, style]}
      accessible
      accessibilityLabel={title}
    >
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.innerBorder} pointerEvents="none" />
      <TgaEmblem
        size={compact ? 52 : 92}
        opacity={0.1}
        style={[styles.watermark, compact ? styles.watermarkCompact : null]}
      />

      <View style={styles.kindBadge}>
        <Ionicons name={KIND_ICONS[kind] ?? 'ribbon'} size={9} color={gotyColors.goldPale} />
        <Text style={styles.kindText}>{compact ? '26' : 'TGA 26'}</Text>
      </View>

      <View style={styles.titleBlock}>
        {!compact ? <Text style={styles.monogram}>{monogram(title)}</Text> : null}
        <Text
          style={[styles.title, compact && styles.titleCompact]}
          numberOfLines={compact ? 3 : 4}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          textBreakStrategy="balanced"
        >
          {title}
        </Text>
        {!compact && subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: gotyColors.stageRaised },
  imageShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '38%',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  editorial: { padding: 10, justifyContent: 'space-between' },
  editorialCompact: { padding: 6 },
  glow: {
    position: 'absolute',
    top: '-30%',
    right: '-35%',
    width: '110%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(223,180,81,0.13)',
  },
  innerBorder: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.15)',
  },
  watermark: { position: 'absolute', right: -12, bottom: -12 },
  watermarkCompact: { right: -8, bottom: -8 },
  kindBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.25)',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  kindText: { color: '#efd58b', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  titleBlock: { flex: 1, justifyContent: 'center', paddingVertical: 4 },
  monogram: { color: 'rgba(223,192,108,0.28)', fontSize: 26, fontWeight: '900', letterSpacing: -1.2, marginBottom: 2 },
  title: { color: gotyColors.text, fontSize: 13, fontWeight: '900', lineHeight: 16, letterSpacing: -0.2 },
  titleCompact: { fontSize: 10, lineHeight: 12 },
  subtitle: { color: 'rgba(203,185,138,0.85)', fontSize: 9.5, fontWeight: '600', marginTop: 3, lineHeight: 12 },
});
