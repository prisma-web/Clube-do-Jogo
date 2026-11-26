import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View, type LayoutRectangle } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useScreenScroll } from '@/components/Screen';
import { themedStyles, useNativeTheme, useThemeColors, radii, spacing } from '@/theme';
import {
  FLOATING_TRAILER_MARGIN,
  floatingTrailerSize,
  floatingTrailerTransform,
  isTrailerInPlace,
  nextTrailerPlayback,
  shouldFloatTrailer,
  trailerRestoreScrollY,
  type TrailerEvent,
  type TrailerPlayback,
} from './floating-trailer';
import { youtubeEmbedUrl } from './youtube';
import { YoutubePlayer, type YoutubePlayerHandle } from './YoutubePlayer';

const FLOAT_ANIMATION_MS = 220;
const CONTROL_SIZE = 32;

export function InlineTrailer({ url, title, posterUrl, suspended }: {
  url: string | null | undefined;
  title: string;
  posterUrl: string;
  suspended: boolean;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const embedUrl = youtubeEmbedUrl(url);
  const [playing, setPlaying] = useState(false);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const stop = useCallback(() => setPlaying(false), []);
  const [wasSuspended, setWasSuspended] = useState(suspended);
  if (suspended !== wasSuspended) {
    setWasSuspended(suspended);
    if (suspended) setPlaying(false);
  }

  useEffect(() => {
    if (!playing) return undefined;
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') stop();
    });
    return () => subscription.remove();
  }, [playing, stop]);

  useFocusEffect(useCallback(() => stop, [stop]));

  if (!embedUrl) return null;

  return (
    <>
      <View style={styles.frame} onLayout={event => setAnchor(event.nativeEvent.layout)}>
        <Image source={{ uri: posterUrl }} style={styles.fill} contentFit="cover" />
        <View style={styles.posterShade} />
        {playing ? null : (
          <Pressable
            onPress={() => setPlaying(true)}
            accessibilityRole="button"
            accessibilityLabel={`Assistir trailer de ${title} aqui`}
            style={styles.fill}
          >
            <View style={styles.playBadge}>
              <Ionicons name="play" size={22} color={colors.white} />
            </View>
            <Text style={styles.posterLabel}>Assistir trailer</Text>
          </Pressable>
        )}
      </View>
      {playing && anchor && anchor.width > 0 ? (
        <PlayingTrailer embedUrl={embedUrl} title={title} anchor={anchor} />
      ) : null}
    </>
  );
}

function PlayingTrailer({ embedUrl, title, anchor }: {
  embedUrl: string;
  title: string;
  anchor: LayoutRectangle;
}) {
  const styles = useStyles();
  const { reduceMotion } = useNativeTheme();
  const screenScroll = useScreenScroll();
  const player = useRef<YoutubePlayerHandle>(null);
  const [playback, setPlayback] = useState<TrailerPlayback>('loading');
  const [inPlace, setInPlace] = useState(true);
  const floating = Boolean(screenScroll) && shouldFloatTrailer(playback, inPlace);
  const progress = useSharedValue(0);
  const fallbackOffset = useSharedValue(0);
  const offset = screenScroll?.offset ?? fallbackOffset;
  const viewportHeight = screenScroll?.viewportHeight ?? fallbackOffset;
  const small = floatingTrailerSize(anchor.width);
  const { x, y, width, height } = anchor;

  const dispatch = useCallback((event: TrailerEvent) => setPlayback(current => nextTrailerPlayback(current, event)), []);

  useAnimatedReaction(
    () => viewportHeight.get() <= 0 || isTrailerInPlace(offset.get(), viewportHeight.get(), y, height),
    (next, previous) => {
      if (next !== previous) runOnJS(setInPlace)(next);
    },
    [y, height],
  );

  useEffect(() => {
    progress.set(withTiming(floating ? 1 : 0, { duration: reduceMotion ? 0 : FLOAT_ANIMATION_MS }));
  }, [floating, progress, reduceMotion]);

  useEffect(() => {
    if (!screenScroll || !floating) return undefined;
    screenScroll.setFocusScrollPaused(true);
    return () => screenScroll.setFocusScrollPaused(false);
  }, [floating, screenScroll]);

  const floatingScale = small.width / width;
  const windowStyle = useAnimatedStyle(() => {
    const { scale, translateX, translateY } = floatingTrailerTransform(width, height, y, offset.get(), floatingScale, progress.get());
    return { transform: [{ translateX }, { translateY }, { scale }] };
  }, [width, height, y, floatingScale]);
  const borderStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const controlsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (offset.get() + FLOATING_TRAILER_MARGIN - y) * progress.get() }],
  }), [y]);
  const controlsFrame = { left: x + width - small.width - CONTROL_SIZE - spacing.xs, top: y };

  function restore() {
    if (!screenScroll) return;
    screenScroll.scrollTo(trailerRestoreScrollY(y, height, viewportHeight.get()));
  }

  function close() {
    player.current?.pause();
    dispatch({ type: 'close' });
  }

  return (
    <>
      <Animated.View style={[styles.player, { left: x, top: y, width, height }, windowStyle]}>
        <YoutubePlayer
          ref={player}
          embedUrl={embedUrl}
          title={title}
          autoplay
          style={styles.webview}
          onPlayerState={state => dispatch({ type: 'youtube', state })}
        />
        <Animated.View pointerEvents="none" style={[styles.floatingBorder, borderStyle]} />
      </Animated.View>
      {floating ? (
        <Animated.View pointerEvents="box-none" style={[styles.controls, controlsFrame, controlsStyle]}>
          <ControlButton icon="arrow-undo-outline" label="Voltar ao trailer" onPress={restore} />
          <ControlButton icon="close" label="Fechar trailer" onPress={close} />
        </Animated.View>
      ) : null}
    </>
  );
}

function ControlButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.controlButton}>
      <Ionicons name={icon} size={16} color={colors.white} />
    </Pressable>
  );
}

const useStyles = themedStyles(colors => ({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.black, marginBottom: spacing.md },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  posterShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  playBadge: { position: 'absolute', top: '50%', left: '50%', marginTop: -28, marginLeft: -28, width: 56, height: 56, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.85)' },
  posterLabel: { position: 'absolute', left: spacing.md, bottom: spacing.md, color: colors.white, fontSize: 12, fontWeight: '800' },
  player: { position: 'absolute', zIndex: 20, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.black },
  floatingBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.xl, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  webview: { flex: 1, backgroundColor: colors.black },
  controls: { position: 'absolute', zIndex: 21, gap: spacing.xs },
  controlButton: { width: CONTROL_SIZE, height: CONTROL_SIZE, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' },
}));
