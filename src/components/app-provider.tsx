'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, LoaderCircle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { demoMonths, demoProfiles } from '@/lib/demo-data';
import type { Profile } from '@/lib/types';
import { monthKey } from '@/lib/utils';
import { DEFAULT_THEME, isThemeId, THEME_STORAGE_KEY, type ThemeId } from '@/lib/themes';

interface AppContextValue {
  user: User | { id: string; email?: string } | null;
  profile: Profile | null;
  authLoading: boolean;
  isDemo: boolean;
  selectedMonth: string;
  availableMonths: string[];
  isHistorical: boolean;
  theme: ThemeId;
  setSelectedMonth: (month: string) => void;
  setTheme: (theme: ThemeId) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  runOperation: <T>(label: string, operation: () => PromiseLike<T>) => Promise<T>;
  runOptimistic: (label: string, apply: () => void, rollback: () => void, operation: () => PromiseLike<unknown>) => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);
const MONTH_STORAGE_KEY = 'clube-do-jogo:selected-month';

function getOperationError(result: unknown): Error | null {
  if (!result || typeof result !== 'object' || !('error' in result)) return null;
  const error = (result as { error?: unknown }).error;
  if (!error) return null;
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error && 'message' in error) return new Error(String(error.message));
  return new Error(String(error));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<AppContextValue['user']>(isDemo ? { id: 'demo-user', email: 'artur@clubedojogo.com' } : null);
  const [profile, setProfile] = useState<Profile | null>(isDemo ? demoProfiles[0] : null);
  const [authLoading, setAuthLoading] = useState(!isDemo);
  const [selectedMonth, setSelectedMonthState] = useState(monthKey());
  const [availableMonths, setAvailableMonths] = useState<string[]>(isDemo ? demoMonths : [monthKey()]);
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [operations, setOperations] = useState<{ id: string; label: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

  const showError = useCallback((value: unknown) => {
    const id = crypto.randomUUID();
    const detail = value instanceof Error ? value.message : 'Não foi possível concluir a ação.';
    const message = detail && detail !== 'Não foi possível concluir a ação.'
      ? `Não foi possível concluir a ação. ${detail}`
      : detail;
    setToasts(current => [...current, { id, message }]);
    window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 5000);
  }, []);

  const runOperation = useCallback(async function runOperation<T>(label: string, operation: () => PromiseLike<T>) {
    const id = crypto.randomUUID();
    setOperations(current => [...current, { id, label }]);
    try {
      const result = await operation();
      const error = getOperationError(result);
      if (error) showError(error);
      return result;
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setOperations(current => current.filter(item => item.id !== id));
    }
  }, [showError]);

  const runOptimistic = useCallback(async (label: string, apply: () => void, rollback: () => void, operation: () => PromiseLike<unknown>) => {
    const id = crypto.randomUUID();
    apply();
    setOperations(current => [...current, { id, label }]);
    try {
      const result = await operation();
      const error = getOperationError(result);
      if (error) throw error;
      return true;
    } catch (error) {
      rollback();
      showError(error);
      return false;
    } finally {
      setOperations(current => current.filter(item => item.id !== id));
    }
  }, [showError]);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) setProfile(data as Profile);
  }, [supabase]);

  const fetchAvailableMonths = useCallback(async () => {
    if (isDemo) return;
    const current = monthKey();
    const [{ data: clubMonths }, { data: votes }] = await Promise.all([
      supabase.from('club_months').select('month').lte('month', current),
      supabase.from('votes').select('vote_month'),
    ]);
    const months = new Set<string>([current]);
    clubMonths?.forEach(item => item.month && months.add(item.month));
    votes?.forEach(item => {
      if (item.vote_month && item.vote_month <= current) months.add(item.vote_month);
    });
    setAvailableMonths(Array.from(months).sort().reverse());
  }, [isDemo, supabase]);

  useEffect(() => {
    const stored = window.localStorage.getItem(MONTH_STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}$/.test(stored) && stored <= monthKey()) {
      queueMicrotask(() => setSelectedMonthState(stored));
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) queueMicrotask(() => setThemeState(stored));
    else if (stored) window.localStorage.removeItem(THEME_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void fetchProfile(data.session.user.id);
        void fetchAvailableMonths();
      }
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void fetchProfile(session.user.id);
        void fetchAvailableMonths();
      } else {
        setProfile(null);
      }
      setAuthLoading(false);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchAvailableMonths, fetchProfile, isDemo, supabase]);

  const setSelectedMonth = useCallback((value: string) => {
    if (value > monthKey()) return;
    setSelectedMonthState(value);
    window.localStorage.setItem(MONTH_STORAGE_KEY, value);
  }, []);

  const setTheme = useCallback((value: ThemeId) => {
    setThemeState(value);
    document.documentElement.dataset.theme = value;
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, []);

  const signOut = useCallback(async () => {
    if (!isDemo) await runOperation('Saindo da conta…', () => supabase.auth.signOut());
  }, [isDemo, runOperation, supabase]);

  const value = useMemo<AppContextValue>(() => ({
    user,
    profile,
    authLoading,
    isDemo,
    selectedMonth,
    availableMonths,
    isHistorical: selectedMonth < monthKey(),
    theme,
    setSelectedMonth,
    setTheme,
    signOut,
    runOperation,
    runOptimistic,
    refreshProfile: async () => {
      if (user) await fetchProfile(user.id);
    },
  }), [authLoading, availableMonths, fetchProfile, isDemo, profile, runOperation, runOptimistic, selectedMonth, setSelectedMonth, setTheme, signOut, theme, user]);

  const currentOperation = operations.at(-1);

  return (
    <AppContext.Provider value={value}>
      {children}
      <AnimatePresence mode="wait">
        {currentOperation && (
          <motion.div
            key={currentOperation.id}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[300] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#17171c]/95 px-3.5 py-2 text-xs font-bold text-white shadow-xl shadow-black/35 backdrop-blur-md"
          >
            <LoaderCircle className="size-3.5 animate-spin text-violet-300" />
            {currentOperation.label}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none fixed inset-x-3 top-[max(4rem,calc(env(safe-area-inset-top)+4rem))] z-[310] flex flex-col items-center gap-2" aria-live="assertive">
        <AnimatePresence initial={false}>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              role="alert"
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-red-400/20 bg-[#211416]/95 px-4 py-3 text-xs font-semibold leading-relaxed text-red-100 shadow-2xl shadow-black/40 backdrop-blur-md"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
              <span className="min-w-0 flex-1">{toast.message}</span>
              <button aria-label="Fechar aviso" onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))} className="grid size-6 shrink-0 place-items-center rounded-full text-red-200/60 hover:bg-white/10 hover:text-red-100"><X className="size-3.5" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp precisa estar dentro de AppProvider.');
  return value;
}
