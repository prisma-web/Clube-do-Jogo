import * as React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { createMobileApiTransport, getMobileSupabaseClient, nativeStorage } from '@/platform';
import { createExpoNotificationsAdapter } from '@/platform/notifications';
import { createNativePushApi } from '@/platform/push-api';
import {
  createPushController,
  type PushController,
  type PushNotificationsSnapshot,
} from '@/platform/push-controller';
import { PushNavigationCoordinator, resolvePushDestination } from '@/platform/push-navigation';
import { useAppInternal } from './app-provider';
import { registerPushSignOutHandler } from './push-session';

export type PushNotificationsValue = PushNotificationsSnapshot & {
  requestPermission(): Promise<void>;
  retry(): Promise<void>;
};

const PushNotificationsContext = React.createContext<PushNotificationsValue | null>(null);

export function NotificationBridge({ children }: { children: React.ReactNode }): React.ReactElement {
  const { ready, userId, isDemo, sessionEpoch, dataClient } = useAppInternal();
  const router = useRouter();
  const adapter = useMemo(() => createExpoNotificationsAdapter(), []);
  const controller = useMemo<PushController>(() => {
    const client = getMobileSupabaseClient();
    return createPushController({
      adapter,
      api: createNativePushApi(createMobileApiTransport(client)),
      storage: nativeStorage,
    });
  }, [adapter]);
  const navigation = useMemo(() => new PushNavigationCoordinator(), []);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [responseVersion, responseCaptured] = React.useReducer(value => value + 1, 0);
  const currentBoundaryRef = useRef({ ready, userId, epoch: sessionEpoch, isDemo });

  useLayoutEffect(() => {
    currentBoundaryRef.current = { ready, userId, epoch: sessionEpoch, isDemo };
  }, [isDemo, ready, sessionEpoch, userId]);

  useEffect(() => {
    let disposed = false;
    let stop: () => void = () => undefined;
    void controller.start().then(dispose => {
      if (disposed) dispose();
      else stop = dispose;
    });
    return () => {
      disposed = true;
      stop();
    };
  }, [controller]);

  useEffect(() => registerPushSignOutHandler(controller), [controller]);

  useEffect(() => {
    void controller.setSession(ready && userId && !isDemo ? { userId, epoch: sessionEpoch } : null);
  }, [controller, isDemo, ready, sessionEpoch, userId]);

  useEffect(() => {
    const capture = (response: Parameters<typeof navigation.capture>[0]) => {
      if (navigation.capture(response)) responseCaptured();
    };
    const stopReceived = adapter.subscribeReceived(() => undefined);
    const stopResponses = adapter.subscribeResponses(capture);
    void adapter.getLastResponse().then(response => {
      if (response) capture(response);
      return response ? adapter.clearLastResponse() : undefined;
    }).catch(() => undefined);
    return () => {
      stopReceived();
      stopResponses();
    };
  }, [adapter, navigation]);

  useEffect(() => {
    if (!navigation.updateBoundary(currentBoundaryRef.current)) return;
    const resolution = navigation.beginResolution();
    if (!resolution || !userId) return;
    void resolvePushDestination(resolution.response.data.url, {
      game: async id => Boolean(await dataClient.readGame({ userId, isDemo: false, gameId: id })),
      profile: async id => Boolean(await dataClient.readProfile(id, false)),
    }).then(intent => {
      if (!navigation.consume(resolution, currentBoundaryRef.current)) return;
      router.push(intent);
    }).catch(() => {
      if (!navigation.consume(resolution, currentBoundaryRef.current)) return;
      router.push('/(app)/(tabs)/jogo-do-mes');
    });
  }, [dataClient, isDemo, navigation, ready, responseVersion, router, sessionEpoch, userId]);

  const requestPermission = useCallback(
    () => isDemo ? Promise.resolve() : controller.requestPermission(),
    [controller, isDemo],
  );
  const retry = useCallback(() => controller.retry(), [controller]);
  const value = useMemo<PushNotificationsValue>(() => ({
    ...(isDemo ? { status: 'unavailable' as const, registered: false, remoteUnlinkPending: false, error: null } : snapshot),
    requestPermission,
    retry,
  }), [isDemo, requestPermission, retry, snapshot]);

  return <PushNotificationsContext.Provider value={value}>{children}</PushNotificationsContext.Provider>;
}

export function usePushNotifications(): PushNotificationsValue {
  const value = React.useContext(PushNotificationsContext);
  if (!value) throw new Error('usePushNotifications precisa estar dentro de NotificationBridge.');
  return value;
}
