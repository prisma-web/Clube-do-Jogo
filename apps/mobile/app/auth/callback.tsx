import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { completeAuthCallback } from '@/platform/auth';
import {
  AUTHENTICATED_INTENT_NAVIGATION_OPTIONS,
  consumeNavIntent,
  DEFAULT_APP_ROUTE,
} from '@/lib/nav-intent';
import { useApp } from '@/state/app-provider';
import { themedStyles, useThemeColors, spacing, typography } from '@/theme';

const SESSION_WAIT_TIMEOUT_MS = 10_000;

type CallbackState =
  | { status: 'exchanging'; requestId: number }
  | { status: 'waiting-session'; requestId: number; expectedUserId: string }
  | { status: 'error'; requestId: number; message: string };

export default function AuthCallbackScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const router = useRouter();
  const { ready, userId } = useApp();
  const returnLabel = ready && userId ? 'Voltar ao clube' : 'Voltar ao login';
  const [callbackState, setCallbackState] = useState<CallbackState>({ status: 'exchanging', requestId: 0 });
  const processedKey = useRef<string | null>(null);
  const requestId = useRef(0);
  const navigatedRequestId = useRef(0);

  const queryString = useMemo(() => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') query.set(key, value);
      else if (Array.isArray(value) && typeof value[0] === 'string') query.set(key, value[0]);
    });
    return query.toString();
  }, [params]);
  const queryKey = queryString || '(sem parâmetros)';

  useEffect(() => {
    if (processedKey.current === queryKey) return;
    processedKey.current = queryKey;
    const thisRequest = ++requestId.current;
    setCallbackState({ status: 'exchanging', requestId: thisRequest });
    const url = `clubedojogo://auth/callback${queryString ? `?${queryString}` : ''}`;
    completeAuthCallback(url)
      .then(result => {
        if (requestId.current !== thisRequest) return;
        setCallbackState({ status: 'waiting-session', requestId: thisRequest, expectedUserId: result.userId });
      })
      .catch(error => {
        if (requestId.current !== thisRequest) return;
        setCallbackState({
          status: 'error',
          requestId: thisRequest,
          message: error instanceof Error ? error.message : 'Não foi possível concluir o login.',
        });
      });
  }, [queryKey, queryString]);

  useEffect(() => {
    if (callbackState.status !== 'waiting-session') return;
    if (callbackState.requestId !== requestId.current) return;
    if (ready && userId === callbackState.expectedUserId) {
      if (navigatedRequestId.current === requestId.current) return;
      navigatedRequestId.current = requestId.current;
      const intent = consumeNavIntent();
      if (intent) router.replace(intent, AUTHENTICATED_INTENT_NAVIGATION_OPTIONS);
      else router.replace(DEFAULT_APP_ROUTE);
      return;
    }
    const timer = setTimeout(() => {
      setCallbackState({
        status: 'error',
        requestId: callbackState.requestId,
        message: 'Login concluído, mas não foi possível confirmar sua sessão. Tente novamente.',
      });
    }, SESSION_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [callbackState, ready, router, userId]);

  return (
    <View style={styles.container}>
      {callbackState.status === 'error' ? (
        <>
          <Text style={styles.errorText} accessibilityRole="alert">{callbackState.message}</Text>
          <Button
            label={returnLabel}
            variant="secondary"
            onPress={() => router.replace(ready && userId ? '/(app)/(tabs)/jogo-do-mes' : '/(auth)/login')}
            accessibilityLabel={returnLabel}
          />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.violet400} size="large" />
          <Text style={styles.label}>{callbackState.status === 'exchanging' ? 'Concluindo login…' : 'Confirmando sessão…'}</Text>
        </>
      )}
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background, padding: spacing.xl },
  label: { ...typography.small, color: colors.zinc400 },
  errorText: { ...typography.body, color: colors.red300, textAlign: 'center' },
}));
