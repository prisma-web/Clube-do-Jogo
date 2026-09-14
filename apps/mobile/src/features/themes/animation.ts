import { useEffect } from 'react';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export function useLoop(active: boolean, duration: number, offset = 0): SharedValue<number> {
  const progress = useSharedValue(offset);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = offset;
      return;
    }
    progress.value = offset;
    progress.value = withRepeat(withTiming(offset + 1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [active, duration, offset, progress]);

  return progress;
}

export function usePulse(active: boolean, duration: number, offset = 0): SharedValue<number> {
  const progress = useSharedValue(offset);

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = offset;
      return;
    }
    progress.value = offset;
    progress.value = withRepeat(withTiming(1 - offset, { duration, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(progress);
  }, [active, duration, offset, progress]);

  return progress;
}
