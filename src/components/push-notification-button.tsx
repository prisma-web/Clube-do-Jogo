'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useApp } from './app-provider';

type PushState = 'checking' | 'inactive' | 'enabled' | 'blocked' | 'unavailable' | 'error';

const noopSubscribe = () => () => {};
// Suporte a push só é conhecido no cliente. useSyncExternalStore reconcilia o
// snapshot do servidor (false) com o do cliente sem erro de hidratação.
const getSupportSnapshot = () => 'serviceWorker' in navigator && 'PushManager' in window;
const getSupportServerSnapshot = () => false;

function base64UrlToUint8Array(value: string) {
  const base64 = `${value.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - value.length % 4) % 4)}`;
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

export function PushNotificationButton({ className = '' }: { className?: string }) {
  const { isDemo } = useApp();
  const [state, setState] = useState<PushState>('checking');
  const supported = useSyncExternalStore(noopSubscribe, getSupportSnapshot, getSupportServerSnapshot);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const isConfigured = !isDemo && Boolean(publicKey);
  const lacksBrowserSupport = !supported;

  useEffect(() => {
    if (!isConfigured || !supported) return;
    void navigator.serviceWorker.getRegistration()
      .then(registration => {
        if (Notification.permission === 'denied') {
          setState('blocked');
          return null;
        }
        return registration?.pushManager.getSubscription() || null;
      })
      .then(subscription => {
        if (Notification.permission !== 'denied') setState(subscription ? 'enabled' : 'inactive');
      })
      .catch(() => setState('inactive'));
  }, [isConfigured, supported]);

  async function enablePush() {
    if (!publicKey || state === 'blocked' || state === 'unavailable') return;
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') {
        setState('blocked');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error('Nao foi possivel salvar a inscricao.');
      setState('enabled');
    } catch (error) {
      console.error('Erro ao ativar notificacoes:', error);
      setState('error');
    }
  }

  const enabled = state === 'enabled';
  const label = enabled
    ? 'Notificacoes ativadas'
    : state === 'blocked'
      ? 'Notificacoes bloqueadas no navegador'
      : state === 'unavailable'
        ? 'Notificacoes indisponiveis'
        : state === 'error'
          ? 'Tentar ativar notificacoes novamente'
          : 'Ativar notificacoes';

  if (!isConfigured || lacksBrowserSupport || state === 'unavailable') return null;

  return (
    <button type="button" onClick={() => void enablePush()} disabled={state === 'checking' || state === 'blocked'} aria-label={label} title={label} className={`grid size-9 place-items-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-55 ${enabled ? 'border-violet-400/35 bg-violet-500/15 text-violet-300' : 'border-white/[0.08] bg-white/[0.035] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100'} ${className}`}>
      {enabled ? <BellRing className="size-4" /> : <Bell className="size-4" />}
    </button>
  );
}
