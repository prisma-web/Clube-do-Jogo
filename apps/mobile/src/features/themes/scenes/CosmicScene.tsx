import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { Image } from 'expo-image';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useNativeTheme } from '@/theme';
import { themeImages } from '../assets';
import { useLoop, usePulse } from '../animation';
import { useThemeScene } from '../scene-context';

const scene = {
  space: '#010205',
  ink: '#f3ead9',
  inkSoft: '#c5b8a4',
  ember: '#e8964b',
  emberSoft: 'rgba(232,150,75,0.28)',
  star: '#ffe5bd',
  caption: 'rgba(4,7,11,0.86)',
  hairline: 'rgba(224,187,138,0.22)',
};

const stars = [
  { x: 0.08, y: 0.12, size: 2, group: 0 },
  { x: 0.21, y: 0.3, size: 1.5, group: 1 },
  { x: 0.33, y: 0.08, size: 2.5, group: 2 },
  { x: 0.47, y: 0.22, size: 1.5, group: 0 },
  { x: 0.58, y: 0.06, size: 2, group: 1 },
  { x: 0.71, y: 0.18, size: 1.5, group: 2 },
  { x: 0.84, y: 0.1, size: 2.5, group: 0 },
  { x: 0.93, y: 0.28, size: 1.5, group: 1 },
  { x: 0.15, y: 0.46, size: 1.5, group: 2 },
  { x: 0.62, y: 0.4, size: 2, group: 0 },
  { x: 0.88, y: 0.5, size: 1.5, group: 1 },
  { x: 0.38, y: 0.52, size: 1.5, group: 2 },
];

export const celestialBodies = [
  {
    id: 'timber-hearth',
    name: 'Lar de Madeira',
    description: 'O planeta natal. Florestas, gêiseres e a fogueira onde o clube se reúne antes de partir.',
    image: themeImages.timberHearth,
  },
  {
    id: 'brittle-hollow',
    name: 'Oco Quebradiço',
    description: 'A crosta desaba pedaço por pedaço sobre o buraco negro alojado no núcleo.',
    image: themeImages.brittleHollow,
  },
  {
    id: 'giants-deep',
    name: 'Profundeza do Gigante',
    description: 'Tempestades elétricas escondem ilhas que sobem e afundam sem aviso.',
    image: themeImages.giantsDeep,
  },
  {
    id: 'dark-bramble',
    name: 'Sarça Escura',
    description: 'Um labirinto de névoa em que cada passagem devolve você a outro nó do emaranhado.',
    image: themeImages.darkBramble,
  },
  {
    id: 'hourglass-twins',
    name: 'Gêmeos da Ampulheta',
    description: 'A areia de um irmão escorre para o outro até que só reste rocha nua.',
    image: themeImages.hourglassTwins,
  },
  {
    id: 'quantum-moon',
    name: 'Lua Quântica',
    description: 'Permanece onde está apenas enquanto alguém a observa.',
    image: themeImages.quantumMoon,
  },
] as const;

type BodyId = (typeof celestialBodies)[number]['id'];

const passes: { image: number; top: DimensionValue; size: number; duration: number; offset: number; opacity: number }[] = [
  { image: themeImages.giantsDeep, top: '-6%', size: 190, duration: 74000, offset: 0.1, opacity: 0.5 },
  { image: themeImages.brittleHollow, top: '48%', size: 96, duration: 58000, offset: 0.55, opacity: 0.45 },
  { image: themeImages.darkBramble, top: '18%', size: 60, duration: 92000, offset: 0.8, opacity: 0.35 },
];

export function CosmicScene({ interactive = false, focused = true }: { interactive?: boolean; focused?: boolean }) {
  const { animated: themeAnimated } = useNativeTheme();
  const animated = themeAnimated && focused;
  const { mode, audio } = useThemeScene();
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [focus, setFocus] = useState<BodyId | null>(null);

  const twinkleA = usePulse(animated, 2400);
  const twinkleB = usePulse(animated, 3300, 0.4);
  const twinkleC = usePulse(animated, 4100, 0.7);
  const flame = usePulse(animated, 900);
  const twinkles = [twinkleA, twinkleB, twinkleC];

  const selected = celestialBodies.find(body => body.id === focus) ?? null;

  const selectBody = useCallback(
    (id: BodyId) => {
      setFocus(current => (current === id ? null : id));
      audio.playSignal('select');
    },
    [audio],
  );

  return (
    <View style={styles.root} onLayout={event => setBounds(event.nativeEvent.layout)}>
      {mode === 'hearth' ? (
        <Image source={themeImages.cosmicHearth} style={StyleSheet.absoluteFill} contentFit="cover" transition={260} />
      ) : (
        <Image source={themeImages.cosmicObservatory} style={StyleSheet.absoluteFill} contentFit="cover" transition={260} />
      )}
      <View style={styles.veil} />

      {stars.map(star => (
        <Star key={`${star.x}-${star.y}`} {...star} bounds={bounds} pulse={twinkles[star.group]} />
      ))}

      {mode === 'spaceflight'
        ? passes.map(pass => (
            <Pass key={String(pass.top)} {...pass} animated={animated} width={bounds.width} />
          ))
        : <Campfire flame={flame} />}

      {interactive ? (
        <View style={styles.panel} pointerEvents="box-none">
          {selected ? (
            <View style={styles.readout} testID="theme-scene-cosmic-readout">
              <Image source={selected.image} style={styles.readoutImage} contentFit="contain" />
              <View style={styles.readoutText}>
                <Text style={styles.readoutName}>{selected.name}</Text>
                <Text style={styles.readoutDescription}>{selected.description}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.hint} testID="theme-scene-cosmic-hint">
              {mode === 'hearth'
                ? 'Você está no acampamento. Escolha um corpo celeste para consultar o mapa.'
                : 'Travessia em curso. Escolha um corpo celeste para consultar o mapa.'}
            </Text>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            {celestialBodies.map(body => {
              const active = body.id === focus;
              return (
                <Pressable
                  key={body.id}
                  onPress={() => selectBody(body.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Corpo celeste ${body.name}`}
                  style={[styles.chip, active && styles.chipActive]}
                  testID={`theme-scene-cosmic-body-${body.id}`}
                >
                  <Image source={body.image} style={styles.chipImage} contentFit="contain" />
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
                    {body.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function Star({ x, y, size, bounds, pulse }: {
  x: number;
  y: number;
  size: number;
  bounds: { width: number; height: number };
  pulse: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.7 }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.star,
        { left: x * bounds.width, top: y * bounds.height, width: size * 2, height: size * 2, borderRadius: size },
        style,
      ]}
    />
  );
}

function Pass({ image, top, size, duration, offset, opacity, animated, width }: {
  image: number;
  top: DimensionValue;
  size: number;
  duration: number;
  offset: number;
  opacity: number;
  animated: boolean;
  width: number;
}) {
  const progress = useLoop(animated, duration, offset);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value % 1, [0, 1], [width + size, -size * 1.4]) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pass, { top, width: size, height: size, opacity }, style]}
    >
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  );
}

function Campfire({ flame }: { flame: SharedValue<number> }) {
  const glow = useAnimatedStyle(() => ({
    opacity: 0.45 + flame.value * 0.4,
    transform: [{ scale: 0.92 + flame.value * 0.16 }],
  }));
  const core = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.85 + flame.value * 0.35 }],
  }));
  return (
    <View style={styles.campfire} pointerEvents="none">
      <Animated.View style={[styles.campfireGlow, glow]} />
      <Animated.View style={[styles.campfireCore, core]} />
      <View style={styles.campfireLogLeft} />
      <View style={styles.campfireLogRight} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: scene.space },
  veil: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(1,2,5,0.5)' },
  star: { position: 'absolute', backgroundColor: scene.star },
  pass: { position: 'absolute', left: 0 },
  campfire: { position: 'absolute', left: 0, right: 0, bottom: '16%', alignItems: 'center', justifyContent: 'flex-end', height: 90 },
  campfireGlow: { position: 'absolute', bottom: 0, width: 150, height: 90, borderRadius: 75, backgroundColor: scene.emberSoft },
  campfireCore: { width: 26, height: 40, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: scene.ember },
  campfireLogLeft: { position: 'absolute', bottom: 2, left: '42%', width: 46, height: 7, borderRadius: 4, backgroundColor: '#5a3a22', transform: [{ rotate: '-12deg' }] },
  campfireLogRight: { position: 'absolute', bottom: 2, right: '42%', width: 46, height: 7, borderRadius: 4, backgroundColor: '#6b4529', transform: [{ rotate: '13deg' }] },
  panel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: scene.hairline,
    backgroundColor: scene.caption,
    padding: 10,
    gap: 8,
  },
  hint: { fontSize: 11, fontWeight: '700', color: scene.inkSoft, lineHeight: 15 },
  readout: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  readoutImage: { width: 44, height: 44 },
  readoutText: { flex: 1, gap: 2 },
  readoutName: { fontSize: 13, fontWeight: '800', color: scene.ink },
  readoutDescription: { fontSize: 11, fontWeight: '600', color: scene.inkSoft, lineHeight: 15 },
  chipRow: { gap: 6, paddingRight: 4 },
  chip: {
    alignItems: 'center',
    gap: 4,
    width: 68,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(225,235,232,0.04)',
  },
  chipActive: { borderColor: scene.ember, backgroundColor: 'rgba(232,150,75,0.14)' },
  chipImage: { width: 26, height: 26 },
  chipLabel: { fontSize: 9, fontWeight: '800', color: scene.inkSoft, textAlign: 'center' },
  chipLabelActive: { color: scene.ink },
});
