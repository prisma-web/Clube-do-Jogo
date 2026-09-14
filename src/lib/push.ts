import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { enqueueNativePushNotification } from './push-native';

type StoredPushSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

function notificationErrorStatus(error: unknown) {
  return typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number'
    ? error.statusCode
    : null;
}

export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

export async function sendPushNotification(admin: SupabaseClient, message: PushMessage, userIds?: string[], excludeUserId?: string) {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return { sent: 0, configured: false };

  let request = admin.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (userIds) {
    if (!userIds.length) return { sent: 0, configured: true };
    request = request.in('user_id', userIds);
  } else if (excludeUserId) {
    request = request.neq('user_id', excludeUserId);
  }
  const { data: subscriptions, error } = await request;
  if (error) throw error;
  if (!subscriptions?.length) return { sent: 0, configured: true };

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify(message);
  const storedSubscriptions = subscriptions as StoredPushSubscription[];
  const results = await Promise.allSettled(storedSubscriptions.map(subscription => webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, payload, { TTL: 60 * 60 * 24 })));
  const expiredIds = results.flatMap((result, index) => {
    const status = result.status === 'rejected' ? notificationErrorStatus(result.reason) : null;
    return status === 404 || status === 410 ? [storedSubscriptions[index].id] : [];
  });
  if (expiredIds.length) await admin.from('push_subscriptions').delete().in('id', expiredIds);

  return { sent: results.filter(result => result.status === 'fulfilled').length, configured: true };
}

export async function dispatchPushNotification(
  admin: SupabaseClient,
  eventKey: string,
  message: PushMessage,
  userIds?: string[],
  excludeUserId?: string,
  sendWeb = true,
) {
  const [web, native] = await Promise.allSettled([
    sendWeb ? sendPushNotification(admin, message, userIds, excludeUserId) : Promise.resolve({
      sent: 0,
      configured: isPushConfigured(),
    }),
    enqueueNativePushNotification(admin, eventKey, message, userIds, excludeUserId),
  ]);
  if (web.status === 'rejected') throw web.reason;
  return {
    ...web.value,
    native: native.status === 'fulfilled'
      ? native.value
      : { queued: 0, configured: Boolean(process.env.EXPO_PROJECT_ID), error: 'native_enqueue_failed' },
  };
}

export async function isAdminUser(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
  return data?.role === 'admin';
}

export function formatPushMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}
