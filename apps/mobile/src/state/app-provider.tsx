import { AppState } from 'react-native';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppStateStatus } from 'react-native';
import { onlineManager, focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Network from 'expo-network';
import type { Session } from '@supabase/supabase-js';
import { createDataClient, type DataClient } from '@clube-do-jogo/data';
import type { Profile } from '@clube-do-jogo/domain';
import { monthKey } from '@clube-do-jogo/domain';
import {
  bindSupabaseAppState,
  createMobileApiTransport,
  getMobileSupabaseClient,
  getRankingFormula,
  nativeStorage,
  signOutCurrentDevice,
} from '@/platform';
import { createInitialSessionGate, shouldHydrateAuthSession } from './auth-lifecycle';
import { clearPushSession, preparePushSignOut } from './push-session';
import { publishIdentity } from './identity-scope';
import { authMessage } from './auth-messages';

const SELECTED_MONTH_KEY = '@clube-do-jogo/selected-month';

interface SessionState {
  ready: boolean;
  userId: string | null;
  profile: Profile | null;
  isDemo: boolean;
  isAdmin: boolean;
  error: string | null;
  selectedMonth: string;
  activeMonth: string;
  months: string[];
}

interface AppContextValue extends SessionState {
  isHistorical: boolean;
  sessionEpoch: number;
  isSessionCurrent(epoch: number): boolean;
  queryClient: QueryClient;
  dataClient: DataClient;
  setSelectedMonth(month: string): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  enterDemo(): Promise<void>;
  refresh(options?: { selectedMonth?: string }): Promise<void>;
}

const AppContext = React.createContext<AppContextValue | null>(null);

function initialState(): SessionState {
  const month = monthKey();
  return {
    ready: false,
    userId: null,
    profile: null,
    isDemo: false,
    isAdmin: false,
    error: null,
    selectedMonth: month,
    activeMonth: month,
    months: [month],
  };
}

export function AppProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnReconnect: true,
      },
    },
  }));
  const [dataClient] = useState(() => {
    const supabase = getMobileSupabaseClient();
    return createDataClient({
      supabase,
      api: createMobileApiTransport(supabase),
      rankingFormula: getRankingFormula(),
    });
  });
  const [state, setState] = useState<SessionState>(initialState);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const sessionEpochRef = useRef(0);
  const generationRef = useRef(0);
  const stateRef = useRef(state);
  const supabase = getMobileSupabaseClient();
  stateRef.current = state;

  useEffect(() => {
    publishIdentity({ userId: state.userId, isDemo: state.isDemo, sessionEpoch });
  }, [state.userId, state.isDemo, sessionEpoch]);

  useEffect(() => {
    focusManager.setEventListener(handleFocus => {
      const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
        handleFocus(status === 'active');
      });
      handleFocus(AppState.currentState === 'active');
      return () => subscription.remove();
    });
    onlineManager.setEventListener(setOnline => {
      const update = (isConnected: boolean | null | undefined, isInternetReachable: boolean | null | undefined) => {
        setOnline(Boolean(isConnected) && isInternetReachable !== false);
      };
      void Network.getNetworkStateAsync()
        .then(network => update(network.isConnected, network.isInternetReachable))
        .catch(() => setOnline(true));
      const subscription = Network.addNetworkStateListener(network => update(network.isConnected, network.isInternetReachable));
      return () => subscription.remove();
    });
    return () => {
      focusManager.setEventListener(() => () => undefined);
      onlineManager.setEventListener(() => () => undefined);
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setState(current => ({ ...current, ready: true }));
      return undefined;
    }
    const stopRefresh = bindSupabaseAppState(supabase);
    let mounted = true;
    const hydrate = async (session: Session | null) => {
      if (!shouldHydrateAuthSession(session?.user.id || null, stateRef.current)) return;
      const generation = ++generationRef.current;
      void queryClient.cancelQueries();
      queryClient.clear();
      const nextEpoch = sessionEpochRef.current + 1;
      sessionEpochRef.current = nextEpoch;
      setSessionEpoch(nextEpoch);
      if (!session) {
        if (mounted) setState(current => ({
          ...initialState(),
          ready: true,
          selectedMonth: current.selectedMonth,
        }));
        return;
      }
      if (mounted) setState(current => ({
        ...current,
        ready: false,
        userId: session.user.id,
        profile: null,
        isDemo: false,
        isAdmin: false,
        error: null,
      }));
      try {
        const [account, cycleState, storedMonth] = await Promise.all([
          dataClient.readSessionProfile(session.user.id, false),
          dataClient.readCycles(false),
          nativeStorage.getItem(SELECTED_MONTH_KEY),
        ]);
        if (!mounted || generation !== generationRef.current) return;
        const selectedMonth = storedMonth && cycleState.months.includes(storedMonth)
          ? storedMonth
          : cycleState.activeMonth || cycleState.months[0] || monthKey();
        setState({
          ready: true,
          userId: session.user.id,
          profile: account.profile,
          isDemo: false,
          isAdmin: account.isAdmin,
          error: null,
          selectedMonth,
          activeMonth: cycleState.activeMonth || selectedMonth,
          months: cycleState.months.length ? cycleState.months : [selectedMonth],
        });
      } catch (error) {
        if (!mounted || generation !== generationRef.current) return;
        setState(current => ({ ...current, ready: true, error: authMessage(error, 'Não foi possível carregar sua conta.') }));
      }
    };
    let pendingHydration: ReturnType<typeof setTimeout> | null = null;
    const initialSessionGate = createInitialSessionGate();
    const scheduleHydrate = (session: Session | null) => {
      if (pendingHydration !== null) clearTimeout(pendingHydration);
      pendingHydration = setTimeout(() => {
        pendingHydration = null;
        void hydrate(session);
      }, 0);
    };
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      initialSessionGate.observeAuthEvent();
      scheduleHydrate(session);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!initialSessionGate.shouldApplyInitialRead()) return;
      if (error) {
        if (mounted) setState(current => ({ ...current, ready: true, error: authMessage(error, 'Não foi possível restaurar sua sessão.') }));
        return;
      }
      scheduleHydrate(data.session);
    }).catch(error => {
      if (!initialSessionGate.shouldApplyInitialRead()) return;
      if (mounted) setState(current => ({ ...current, ready: true, error: authMessage(error, 'Não foi possível restaurar sua sessão.') }));
    });
    return () => {
      mounted = false;
      if (pendingHydration !== null) clearTimeout(pendingHydration);
      generationRef.current += 1;
      listener.data.subscription.unsubscribe();
      stopRefresh();
    };
  }, [dataClient, queryClient, supabase]);

  const setSelectedMonth = useCallback((month: string) => {
    if (!stateRef.current.months.includes(month)) return;
    setState(current => ({ ...current, selectedMonth: month, error: null }));
    void nativeStorage.setItem(SELECTED_MONTH_KEY, month);
  }, []);

  const resetSessionBoundary = useCallback(() => {
    generationRef.current += 1;
    void queryClient.cancelQueries();
    queryClient.clear();
    dataClient.resetDemo();
    const nextEpoch = sessionEpochRef.current + 1;
    sessionEpochRef.current = nextEpoch;
    setSessionEpoch(nextEpoch);
    setState(current => ({ ...initialState(), ready: true, selectedMonth: current.selectedMonth }));
  }, [dataClient, queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Configure o Supabase para entrar com uma conta.');
    if (!email.trim() || !password) throw new Error('Informe seu email e sua senha.');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(authMessage(error, 'Não foi possível entrar.'));
    if (data.session) {
      setState(current => ({ ...current, error: null }));
    }
  }, [supabase]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    if (!supabase) throw new Error('Configure o Supabase para criar uma conta.');
    if (!name.trim() || !email.trim() || !password) throw new Error('Informe nome, email e senha.');
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: 'clubedojogo://auth/callback',
      },
    });
    if (error) throw new Error(authMessage(error, 'Não foi possível criar sua conta.'));
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (stateRef.current.isDemo) {
      resetSessionBoundary();
      return;
    }
    if (!supabase) {
      resetSessionBoundary();
      return;
    }
    const pushResult = await preparePushSignOut().catch(() => ({ unlinked: false, reason: 'offline' as const }));
    if (!pushResult.unlinked && pushResult.reason !== 'stale') {
      console.warn(`Push remoto não desassociado durante logout (${pushResult.reason}).`);
    }
    try {
      await signOutCurrentDevice(supabase);
      resetSessionBoundary();
    } catch (error) {
      resetSessionBoundary();
      throw new Error(authMessage(error, 'Não foi possível sair da conta.'));
    } finally {
      clearPushSession();
    }
  }, [resetSessionBoundary, supabase]);

  const enterDemo = useCallback(async () => {
    const cycleState = await dataClient.readCycles(true);
    const profile = await dataClient.readProfile('demo-user', true);
    generationRef.current += 1;
    void queryClient.cancelQueries();
    queryClient.clear();
    const nextEpoch = sessionEpochRef.current + 1;
    sessionEpochRef.current = nextEpoch;
    setSessionEpoch(nextEpoch);
    const selectedMonth = cycleState.activeMonth || cycleState.months[0] || monthKey();
    setState({
      ready: true,
      userId: 'demo-user',
      profile,
      isDemo: true,
      isAdmin: true,
      error: null,
      selectedMonth,
      activeMonth: cycleState.activeMonth || selectedMonth,
      months: cycleState.months.length ? cycleState.months : [selectedMonth],
    });
  }, [dataClient, queryClient]);

  const refresh = useCallback(async (options?: { selectedMonth?: string }) => {
    if (stateRef.current.isDemo) {
      const generation = generationRef.current;
      const [cycleState, account] = await Promise.all([
        dataClient.readCycles(true),
        dataClient.readSessionProfile('demo-user', true),
      ]);
      if (generation !== generationRef.current || stateRef.current.userId !== 'demo-user' || !stateRef.current.isDemo) return;
      const requestedMonth = options?.selectedMonth || stateRef.current.selectedMonth;
      const selectedMonth = cycleState.months.includes(requestedMonth)
        ? requestedMonth : cycleState.activeMonth || cycleState.months[0] || monthKey();
      setState(current => ({
        ...current,
        ready: true,
        profile: account.profile,
        isAdmin: account.isAdmin,
        selectedMonth,
        activeMonth: cycleState.activeMonth || selectedMonth,
        months: cycleState.months.length ? cycleState.months : [selectedMonth],
      }));
      return;
    }
    if (!supabase) {
      setState(current => ({ ...current, ready: true }));
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(authMessage(error, 'Não foi possível atualizar sua sessão.'));
    if (!data.session) {
      resetSessionBoundary();
      return;
    }
    const generation = generationRef.current;
    const refreshedUserId = data.session.user.id;
    const [account, cycleState] = await Promise.all([
      dataClient.readSessionProfile(refreshedUserId, false),
      dataClient.readCycles(false),
    ]);
    if (generation !== generationRef.current || stateRef.current.userId !== refreshedUserId || stateRef.current.isDemo) return;
    const requestedMonth = options?.selectedMonth || stateRef.current.selectedMonth;
    const selectedMonth = cycleState.months.includes(requestedMonth)
      ? requestedMonth
      : cycleState.activeMonth || cycleState.months[0] || monthKey();
    setState(current => ({
      ...current,
      ready: true,
      userId: refreshedUserId,
      profile: account.profile,
      isAdmin: account.isAdmin,
      error: null,
      selectedMonth,
      activeMonth: cycleState.activeMonth || selectedMonth,
      months: cycleState.months.length ? cycleState.months : [selectedMonth],
    }));
  }, [dataClient, resetSessionBoundary, supabase]);

  const isSessionCurrent = useCallback((epoch: number) => sessionEpochRef.current === epoch, []);

  const value = useMemo<AppContextValue>(() => ({
    ...state,
    sessionEpoch,
    isSessionCurrent,
    queryClient,
    dataClient,
    isHistorical: state.selectedMonth !== state.activeMonth,
    setSelectedMonth,
    signIn,
    signUp,
    signOut,
    enterDemo,
    refresh,
  }), [dataClient, enterDemo, isSessionCurrent, queryClient, refresh, sessionEpoch, setSelectedMonth, signIn, signOut, signUp, state]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </QueryClientProvider>
  );
}

export function useApp(): Omit<AppContextValue, 'sessionEpoch' | 'queryClient' | 'dataClient' | 'isHistorical'> & { isHistorical: boolean } {
  const value = React.useContext(AppContext);
  if (!value) throw new Error('useApp precisa estar dentro de AppProvider.');
  return value;
}

export function useAppInternal() {
  const value = React.useContext(AppContext);
  if (!value) throw new Error('Os hooks do aplicativo precisam estar dentro de AppProvider.');
  return value;
}
