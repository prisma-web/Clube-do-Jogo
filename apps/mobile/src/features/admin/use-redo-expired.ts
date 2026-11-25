import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useRedoExpired(redoExpiresAt: string | undefined): boolean {
  const deadline = redoExpiresAt ? new Date(redoExpiresAt).getTime() : NaN;
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(deadline)) return undefined;
    const evaluate = () => setClock(Date.now());
    const timer = setTimeout(evaluate, Math.max(0, deadline - Date.now()));
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') evaluate();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [deadline]);

  return !Number.isFinite(deadline) || clock >= deadline;
}
