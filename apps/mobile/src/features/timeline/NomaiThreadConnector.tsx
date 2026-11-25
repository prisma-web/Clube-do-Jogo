import { View } from 'react-native';
import { themedStyles } from '@/theme';

/**
 * Nomai-script thread connector for the Fogueira Cósmica theme, the native counterpart of
 * src/components/nomai-thread-connector.tsx. The app has no SVG renderer, so the single
 * continuous strand is composed from bordered views with matching radii:
 *
 *   1. a descent from the root comment that bends a quarter turn into the reply;
 *   2. an open spiral (three arcs of decreasing radius, each missing one side) where the strand ends;
 *   3. a small eye at the centre of the spiral.
 *
 * Both a soft "glow" copy and the crisp strand are drawn, like the web's two layers. `active`
 * lights only this connector (warm lilac), the native take on the web's focused thread path.
 * `continues` draws the rail down to the next reply so sibling replies stay linked to the root.
 */

export const NOMAI_GUTTER = 30;

const IDLE_STRAND = 'rgba(185,174,230,0.42)';
const IDLE_GLOW = 'rgba(185,174,230,0.14)';
const ACTIVE_STRAND = '#efe4ff';
const ACTIVE_GLOW = 'rgba(199,173,250,0.55)';

export function NomaiThreadConnector({ active = false, continues = false }: { active?: boolean; continues?: boolean }) {
  const styles = useStyles();
  const strand = active ? ACTIVE_STRAND : IDLE_STRAND;
  const glow = active ? ACTIVE_GLOW : IDLE_GLOW;
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={styles.root} testID={active ? 'nomai-connector-active' : 'nomai-connector'}>
      {continues ? <View style={[styles.rail, { backgroundColor: strand, opacity: active ? 0.7 : 0.6 }]} /> : null}
      <Strand color={glow} width={active ? 4 : 3} styles={styles} glow />
      <Strand color={strand} width={active ? 1.6 : 1.35} styles={styles} />
    </View>
  );
}

function Strand({ color, width, styles, glow = false }: {
  color: string;
  width: number;
  styles: ReturnType<typeof useStyles>;
  glow?: boolean;
}) {
  const ring = { borderColor: color, borderWidth: width };
  return (
    <View style={[styles.layer, glow && styles.glowLayer]}>
      {/* Descent with a quarter-turn bend into the reply. */}
      <View style={[styles.descent, { borderLeftColor: color, borderBottomColor: color, borderLeftWidth: width, borderBottomWidth: width }]} />
      {/* Open spiral: each arc drops one side so the strand reads as one winding line. */}
      <View style={[styles.spiralOuter, ring, { borderLeftColor: 'transparent' }]} />
      <View style={[styles.spiralMiddle, ring, { borderTopColor: 'transparent' }]} />
      <View style={[styles.spiralInner, ring, { borderRightColor: 'transparent' }]} />
      <View style={[styles.eye, { backgroundColor: color }]} />
    </View>
  );
}

const useStyles = themedStyles(() => ({
  root: { position: 'absolute', left: 0, top: 0, bottom: 0, width: NOMAI_GUTTER },
  layer: { position: 'absolute', left: 0, top: 0, width: NOMAI_GUTTER, height: 48 },
  glowLayer: { opacity: 0.9, transform: [{ translateX: 0.4 }, { translateY: 0.4 }] },
  rail: { position: 'absolute', left: 7, top: 0, bottom: -12, width: 1.2, borderRadius: 1 },
  descent: {
    position: 'absolute',
    left: 7,
    top: -12,
    width: 13,
    height: 34,
    borderBottomLeftRadius: 13,
  },
  spiralOuter: { position: 'absolute', left: 16, top: 14, width: 14, height: 14, borderRadius: 7 },
  spiralMiddle: { position: 'absolute', left: 19, top: 17, width: 8, height: 8, borderRadius: 4 },
  spiralInner: { position: 'absolute', left: 21, top: 19, width: 4, height: 4, borderRadius: 2 },
  eye: { position: 'absolute', left: 22.4, top: 20.4, width: 1.6, height: 1.6, borderRadius: 1 },
}));
