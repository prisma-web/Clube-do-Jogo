import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Illustrative fallback for rewards without `image_url` (or whose image fails to load). It is the
 * native rendition of the web's /reward-unlock.svg (src/components/reward-celebration.tsx): a gift
 * box with a gold ribbon and bow, drawn with plain views so it needs no SVG renderer.
 */
export function RewardFallbackArt() {
  return (
    <View style={styles.root} accessibilityRole="image" accessibilityLabel="Ilustração de presente" testID="reward-fallback-art">
      <Ionicons name="sparkles" size={18} color="#FDE68A" style={styles.sparkleLeft} />
      <Ionicons name="sparkles" size={14} color="#F0ABFC" style={styles.sparkleRight} />
      <View style={styles.gift}>
        <View style={[styles.bow, styles.bowLeft]} />
        <View style={[styles.bow, styles.bowRight]} />
        <View style={styles.lid} />
        <View style={styles.box} />
        <View style={styles.ribbonVertical} />
        <View style={styles.band} />
        <View style={styles.shadow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gift: { width: 132, height: 112 },
  shadow: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: -6,
    height: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(9,9,11,0.28)',
    zIndex: -1,
  },
  box: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 46,
    bottom: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#7C3AED',
  },
  lid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 30,
    height: 26,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#C084FC',
    zIndex: 1,
  },
  band: { position: 'absolute', left: 0, right: 0, top: 46, height: 10, backgroundColor: '#FDE68A', zIndex: 2 },
  ribbonVertical: { position: 'absolute', left: 56, width: 20, top: 30, bottom: 0, backgroundColor: '#FCD34D', zIndex: 3 },
  bow: {
    position: 'absolute',
    top: 4,
    width: 34,
    height: 28,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: '#FDE68A',
  },
  bowLeft: { left: 32, backgroundColor: '#F9A8D4', transform: [{ rotate: '-24deg' }] },
  bowRight: { right: 32, backgroundColor: '#C4B5FD', transform: [{ rotate: '24deg' }] },
  sparkleLeft: { position: 'absolute', left: '16%', top: '18%' },
  sparkleRight: { position: 'absolute', right: '18%', top: '30%' },
});
