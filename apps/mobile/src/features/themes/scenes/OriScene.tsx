import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useNativeTheme } from '@/theme';
import { themeImages } from '../assets';
import { useLoop, usePulse } from '../animation';

const scene = {
  glow: '#bff7ff',
  glowSoft: 'rgba(115,225,242,0.45)',
  veil: 'rgba(3,10,22,0.55)',
  ink: '#e8fbff',
  inkSoft: '#a8ccd3',
  caption: 'rgba(4,18,31,0.82)',
};

const wisps = [
  { x: 0.22, y: 0.32, size: 7, duration: 9000, offset: 0 },
  { x: 0.68, y: 0.24, size: 5, duration: 12000, offset: 0.3 },
  { x: 0.44, y: 0.62, size: 6, duration: 10500, offset: 0.55 },
  { x: 0.8, y: 0.7, size: 4, duration: 14000, offset: 0.18 },
  { x: 0.12, y: 0.74, size: 5, duration: 11500, offset: 0.82 },
];

const regions = [
  { name: 'a copa das árvores', y: 0.2 },
  { name: 'o tronco antigo', y: 0.52 },
  { name: 'as raízes iluminadas', y: 0.82 },
];

function regionFor(fraction: number): string {
  if (fraction < 0.34) return regions[0].name;
  if (fraction < 0.68) return regions[1].name;
  return regions[2].name;
}

export function OriScene({ interactive = false, focused = true }: { interactive?: boolean; focused?: boolean }) {
  const { animated: themeAnimated } = useNativeTheme();
  const animated = themeAnimated && focused;
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [calls, setCalls] = useState(0);
  const [region, setRegion] = useState<string | null>(null);
  const guideX = useSharedValue(0.5);
  const guideY = useSharedValue(0.5);
  const halo = usePulse(animated, 2600);

  const report = useCallback((fraction: number) => {
    setRegion(regionFor(fraction));
    setCalls(value => value + 1);
  }, []);

  const callLight = useCallback(() => {
    const next = regions[calls % regions.length];
    const nextX = 0.3 + (calls % 3) * 0.2;
    guideX.set(animated ? withTiming(nextX, { duration: 420, easing: Easing.out(Easing.quad) }) : nextX);
    guideY.set(animated ? withTiming(next.y, { duration: 420, easing: Easing.out(Easing.quad) }) : next.y);
    report(next.y);
  }, [animated, calls, guideX, guideY, report]);

  const width = bounds.width;
  const height = bounds.height;

  const pan = Gesture.Pan().onUpdate(event => {
    if (width <= 0 || height <= 0) return;
    const nextY = Math.min(1, Math.max(0, event.y / height));
    guideX.set(Math.min(1, Math.max(0, event.x / width)));
    guideY.set(nextY);
    runOnJS(report)(nextY);
  });

  const tap = Gesture.Tap().onEnd(event => {
    if (width <= 0 || height <= 0) return;
    const nextY = Math.min(1, Math.max(0, event.y / height));
    const nextX = Math.min(1, Math.max(0, event.x / width));
    guideX.set(animated ? withTiming(nextX, { duration: 380 }) : nextX);
    guideY.set(animated ? withTiming(nextY, { duration: 380 }) : nextY);
    runOnJS(report)(nextY);
  });

  const guideStyle = useAnimatedStyle(() => ({
    left: guideX.get() * width - 16,
    top: guideY.get() * height - 16,
    opacity: 0.7 + halo.value * 0.3,
    transform: [{ scale: 0.9 + halo.value * 0.25 }],
  }));

  const visuals = (
    <View style={styles.root} onLayout={event => setBounds(event.nativeEvent.layout)}>
      <Image source={themeImages.oriForest} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} />
      <View style={styles.veil} />
      {wisps.map(wisp => (
        <Wisp key={`${wisp.x}-${wisp.y}`} {...wisp} animated={animated} bounds={bounds} guideX={guideX} guideY={guideY} />
      ))}
      {interactive ? <Animated.View style={[styles.guide, guideStyle]} pointerEvents="none" /> : null}
    </View>
  );

  if (!interactive) return visuals;

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, tap)}>
        <View style={StyleSheet.absoluteFill} accessible={false}>
          {visuals}
        </View>
      </GestureDetector>
      <View style={styles.caption} pointerEvents="box-none">
        <Text style={styles.captionText} testID="theme-scene-ori-feedback">
          {region ? `A luz seguiu para ${region}.` : 'Toque ou arraste para guiar a luz pela floresta.'}
        </Text>
        <View style={styles.captionRow}>
          <Text style={styles.captionCount}>{calls === 1 ? '1 chamado' : `${calls} chamados`}</Text>
          <Pressable
            onPress={callLight}
            accessibilityRole="button"
            accessibilityLabel="Chamar a luz espiritual"
            accessibilityHint="Move a luz para a próxima região da floresta"
            hitSlop={8}
            style={styles.captionAction}
            testID="theme-scene-ori-call"
          >
            <Text style={styles.captionActionText}>Chamar a luz</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Wisp({ x, y, size, duration, offset, animated, bounds, guideX, guideY }: {
  x: number;
  y: number;
  size: number;
  duration: number;
  offset: number;
  animated: boolean;
  bounds: { width: number; height: number };
  guideX: SharedValue<number>;
  guideY: SharedValue<number>;
}) {
  const drift = useLoop(animated, duration, offset);
  const style = useAnimatedStyle(() => {
    const phase = drift.value % 1;
    const wobbleX = Math.sin(phase * Math.PI * 2) * 14;
    const wobbleY = Math.cos(phase * Math.PI * 2) * 10;
    return {
      left: (x + (guideX.get() - x) * 0.22) * bounds.width + wobbleX - size / 2,
      top: (y + (guideY.get() - y) * 0.22) * bounds.height + wobbleY - size / 2,
      opacity: interpolate(phase, [0, 0.5, 1], [0.35, 0.9, 0.35]),
    };
  });
  return (
    <Animated.View
      style={[styles.wisp, { width: size, height: size, borderRadius: size / 2 }, style]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: '#030a16' },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: scene.veil },
  wisp: { position: 'absolute', backgroundColor: scene.glow, shadowColor: scene.glow, shadowOpacity: 0.9, shadowRadius: 8 },
  guide: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: scene.glow,
    backgroundColor: scene.glowSoft,
  },
  caption: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: scene.caption,
    gap: 4,
  },
  captionText: { fontSize: 12, fontWeight: '700', color: scene.ink },
  captionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  captionCount: { fontSize: 10, fontWeight: '800', color: scene.inkSoft, letterSpacing: 0.4 },
  captionAction: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(115,225,242,0.18)' },
  captionActionText: { fontSize: 10, fontWeight: '800', color: scene.glow, letterSpacing: 0.3 },
});
