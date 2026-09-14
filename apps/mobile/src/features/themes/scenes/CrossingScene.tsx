import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useNativeTheme } from '@/theme';
import { useLoop, usePulse } from '../animation';

const scene = {
  skyHigh: '#a4dced',
  skyLow: '#dcefe2',
  sun: '#fbe6a6',
  cloud: '#fdfbf2',
  hillBack: '#9ecb78',
  hillFront: '#74b354',
  water: '#79c9d9',
  sand: '#f1e3ba',
  trunk: '#8a5a34',
  canopy: '#4f9138',
  canopyLight: '#63a745',
  leaf: '#c9a44c',
  ink: '#3d5248',
};

const clouds: { top: DimensionValue; size: number; duration: number; offset: number }[] = [
  { top: '10%', size: 54, duration: 46000, offset: 0 },
  { top: '22%', size: 38, duration: 62000, offset: 0.45 },
  { top: '5%', size: 30, duration: 78000, offset: 0.72 },
];

const leaves: { left: DimensionValue; drift: number; delay: number }[] = [
  { left: '38%', drift: 26, delay: 0 },
  { left: '48%', drift: -18, delay: 90 },
  { left: '57%', drift: 34, delay: 180 },
  { left: '43%', drift: -30, delay: 260 },
];

const shakeMessages = [
  'A árvore balançou e uma folha desceu girando.',
  'Mais uma folha caiu na grama.',
  'O vento levou a folha até a beira da água.',
  'A copa farfalhou e devolveu a calmaria.',
];

export function CrossingScene({ interactive = false, focused = true }: { interactive?: boolean; focused?: boolean }) {
  const { animated: themeAnimated } = useNativeTheme();
  const animated = themeAnimated && focused;
  const [width, setWidth] = useState(0);
  const [shakes, setShakes] = useState(0);
  const canopySway = useSharedValue(0);
  const fall = useSharedValue(0);
  const shimmer = usePulse(animated, 3400);

  const handleShake = useCallback(() => {
    setShakes(value => value + 1);
    if (animated) {
      canopySway.set(
        withSequence(
          withTiming(-1, { duration: 110, easing: Easing.out(Easing.quad) }),
          withTiming(0.8, { duration: 150, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) }),
        ),
      );
      fall.set(0);
      fall.set(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }));
    } else {
      canopySway.set(0);
      fall.set(1);
    }
  }, [animated, canopySway, fall]);

  const canopyStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${canopySway.get() * 4}deg` }],
  }));

  const waterStyle = useAnimatedStyle(() => ({ opacity: 0.55 + shimmer.value * 0.35 }));

  return (
    <View style={styles.root} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.skyHigh} />
      <View style={styles.skyLow} />
      <Sun animated={animated} />
      {clouds.map(cloud => (
        <Cloud key={String(cloud.top)} {...cloud} animated={animated} width={width} />
      ))}
      <View style={styles.hillBack} />
      <View style={styles.hillFront} />
      <View style={styles.sand} />
      <Animated.View style={[styles.water, waterStyle]} />

      <View style={styles.tree} pointerEvents="box-none">
        <Animated.View style={[styles.canopyGroup, canopyStyle]}>
          <View style={[styles.canopy, styles.canopyLeft]} />
          <View style={[styles.canopy, styles.canopyRight]} />
          <View style={[styles.canopy, styles.canopyTop]} />
        </Animated.View>
        <View style={styles.trunk} />
      </View>

      {leaves.map(leaf => (
        <Leaf key={String(leaf.left)} {...leaf} progress={fall} />
      ))}

      {interactive ? (
        <>
          <Pressable
            style={styles.treeTarget}
            onPress={handleShake}
            accessibilityRole="button"
            accessibilityLabel="Balançar a árvore da vila"
            accessibilityHint="Solta folhas e mostra uma mensagem da vila"
            testID="theme-scene-crossing-shake"
          />
          <View style={styles.caption} pointerEvents="none">
            <Text style={styles.captionText} testID="theme-scene-crossing-feedback">
              {shakes === 0 ? 'Toque na árvore para balançá-la.' : shakeMessages[(shakes - 1) % shakeMessages.length]}
            </Text>
            <Text style={styles.captionCount}>{shakes === 1 ? '1 folha' : `${shakes} folhas`}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Sun({ animated }: { animated: boolean }) {
  const bob = usePulse(animated, 5200);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value * 6 - 3 }] }));
  return <Animated.View style={[styles.sun, style]} />;
}

function Cloud({ top, size, duration, offset, animated, width }: {
  top: DimensionValue;
  size: number;
  duration: number;
  offset: number;
  animated: boolean;
  width: number;
}) {
  const progress = useLoop(animated, duration, offset);
  const span = width + size * 3;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value % 1, [0, 1], [span, -size * 3]) }],
  }));
  return (
    <Animated.View style={[styles.cloud, { top, width: size * 2.2, height: size }, style]}>
      <View style={[styles.cloudPuff, { width: size, height: size, borderRadius: size / 2, left: 0 }]} />
      <View style={[styles.cloudPuff, { width: size * 1.3, height: size * 1.3, borderRadius: size, left: size * 0.55, top: -size * 0.25 }]} />
      <View style={[styles.cloudPuff, { width: size * 0.9, height: size * 0.9, borderRadius: size / 2, left: size * 1.3, top: size * 0.1 }]} />
    </Animated.View>
  );
}

function Leaf({ left, drift, delay, progress }: {
  left: DimensionValue;
  drift: number;
  delay: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, (progress.get() * 1600 - delay) / 1200));
    return {
      opacity: local <= 0 || local >= 1 ? 0 : 1,
      transform: [
        { translateY: local * 96 },
        { translateX: Math.sin(local * Math.PI * 2) * drift },
        { rotate: `${local * 320}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.leaf, { left }, style]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: scene.skyLow },
  skyHigh: { position: 'absolute', left: 0, right: 0, top: 0, height: '62%', backgroundColor: scene.skyHigh },
  skyLow: { position: 'absolute', left: 0, right: 0, top: '46%', height: '20%', backgroundColor: scene.skyLow, opacity: 0.75 },
  sun: { position: 'absolute', right: '12%', top: '8%', width: 46, height: 46, borderRadius: 23, backgroundColor: scene.sun },
  cloud: { position: 'absolute', left: 0 },
  cloudPuff: { position: 'absolute', backgroundColor: scene.cloud },
  hillBack: {
    position: 'absolute',
    left: '-30%',
    right: '-30%',
    top: '48%',
    height: '90%',
    borderTopLeftRadius: 600,
    borderTopRightRadius: 600,
    backgroundColor: scene.hillBack,
  },
  hillFront: {
    position: 'absolute',
    left: '-20%',
    right: '-45%',
    top: '62%',
    height: '80%',
    borderTopLeftRadius: 500,
    borderTopRightRadius: 500,
    backgroundColor: scene.hillFront,
  },
  sand: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '13%', backgroundColor: scene.sand },
  water: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '7%', backgroundColor: scene.water },
  tree: { position: 'absolute', left: '36%', top: '30%', width: 90, height: 120, alignItems: 'center' },
  canopyGroup: { width: 90, height: 66 },
  canopy: { position: 'absolute', backgroundColor: scene.canopy },
  canopyLeft: { left: 0, top: 18, width: 48, height: 48, borderRadius: 24 },
  canopyRight: { right: 0, top: 14, width: 52, height: 52, borderRadius: 26, backgroundColor: scene.canopyLight },
  canopyTop: { left: 22, top: 0, width: 46, height: 46, borderRadius: 23 },
  trunk: { width: 12, height: 54, borderRadius: 4, backgroundColor: scene.trunk, marginTop: -4 },
  treeTarget: { position: 'absolute', left: '32%', top: '26%', width: 108, height: 132, borderRadius: 24 },
  leaf: { position: 'absolute', top: '46%', width: 9, height: 6, borderRadius: 4, backgroundColor: scene.leaf },
  caption: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(253,251,242,0.86)',
    gap: 2,
  },
  captionText: { fontSize: 12, fontWeight: '700', color: scene.ink },
  captionCount: { fontSize: 10, fontWeight: '800', color: scene.trunk, letterSpacing: 0.4 },
});
