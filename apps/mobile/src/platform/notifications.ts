import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type {
  NativeNotification,
  NativeNotificationResponse,
  NotificationsAdapter,
  PushPermission,
  PushToken,
} from './push-controller';

function projectId() {
  const value = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function permission(status: Notifications.NotificationPermissionsStatus): PushPermission {
  const ios = status.ios?.status;
  if (ios === Notifications.IosAuthorizationStatus.AUTHORIZED
    || ios === Notifications.IosAuthorizationStatus.PROVISIONAL
    || ios === Notifications.IosAuthorizationStatus.EPHEMERAL) return 'granted';
  if (ios === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
  if (ios === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return 'undetermined';
  if (status.granted || status.status === 'granted') return 'granted';
  return status.status === 'denied' ? 'denied' : 'undetermined';
}

function notification(value: Notifications.Notification): NativeNotification {
  return {
    identifier: value.request.identifier,
    data: value.request.content.data as Record<string, unknown>,
  };
}

function response(value: Notifications.NotificationResponse): NativeNotificationResponse {
  return { ...notification(value.notification), actionIdentifier: value.actionIdentifier };
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Clube do Jogo',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#8b5cf6',
  });
}

export function createExpoNotificationsAdapter(): NotificationsAdapter {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  const availability = () => {
    const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null;
    const id = projectId();
    const expoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';
    return { available: Boolean(Device.isDevice && platform && id && !expoGoAndroid), projectId: id, platform };
  };
  const getToken = async (): Promise<PushToken> => {
    const current = availability();
    if (!current.available || !current.projectId || !current.platform) {
      throw new Error('Este build não está configurado para notificações push.');
    }
    await ensureChannel();
    const token = await Notifications.getExpoPushTokenAsync({ projectId: current.projectId });
    return { expoPushToken: token.data, projectId: current.projectId, platform: current.platform };
  };

  return {
    availability,
    async getPermission() {
      return permission(await Notifications.getPermissionsAsync());
    },
    async requestPermission() {
      await ensureChannel();
      return permission(await Notifications.requestPermissionsAsync());
    },
    getToken,
    subscribeToken(listener) {
      let refreshing = false;
      const subscription = Notifications.addPushTokenListener(() => {
        if (refreshing) return;
        refreshing = true;
        setTimeout(() => {
          void getToken().then(listener).catch(() => undefined).finally(() => { refreshing = false; });
        }, 0);
      });
      return () => subscription.remove();
    },
    subscribeReceived(listener) {
      const subscription = Notifications.addNotificationReceivedListener(value => listener(notification(value)));
      return () => subscription.remove();
    },
    subscribeResponses(listener) {
      const subscription = Notifications.addNotificationResponseReceivedListener(value => listener(response(value)));
      return () => subscription.remove();
    },
    async getLastResponse() {
      const value = Notifications.getLastNotificationResponse();
      return value ? response(value) : null;
    },
    async clearLastResponse() {
      Notifications.clearLastNotificationResponse();
    },
    subscribeForeground(listener) {
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') listener();
      });
      return () => subscription.remove();
    },
  };
}

export const DEFAULT_NOTIFICATION_ACTION = Notifications.DEFAULT_ACTION_IDENTIFIER;
