import { useCallback, useMemo } from 'react';
import type { RatingScale } from '@clube-do-jogo/domain';
import { useAppInternal } from '@/state/app-provider';
import { usePersistentState } from './use-persistent-state';
import { DEFAULT_MOBILE_PREFERENCES, mobilePreferencesStorageKey, parseMobilePreferences } from './mobile-preferences-core';

export function useRatingScale(): [RatingScale, (scale: RatingScale) => void] {
  const { userId, isDemo, sessionEpoch, ready, isSessionCurrent } = useAppInternal();
  const key = mobilePreferencesStorageKey(userId, isDemo, sessionEpoch);
  const options = useMemo(() => ({ parse: parseMobilePreferences, scope: false }), []);
  const [preferences, setPreferences] = usePersistentState(key, DEFAULT_MOBILE_PREFERENCES, options);
  const setScale = useCallback((ratingScale: RatingScale) => {
    if (!ready || !userId || !isSessionCurrent(sessionEpoch) || (ratingScale !== 5 && ratingScale !== 10)) return;
    setPreferences(current => ({ ...current, ratingScale }));
  }, [isSessionCurrent, ready, sessionEpoch, setPreferences, userId]);
  return [preferences.ratingScale, setScale];
}
