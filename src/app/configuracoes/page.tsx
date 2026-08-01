'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import * as Tabs from '@radix-ui/react-tabs';
import { Bell, Gamepad2, Palette, ShieldCheck, SlidersHorizontal, Trophy } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { ThemeSelector } from '@/components/theme-selector';
import { PushNotificationButton } from '@/components/push-notification-button';
import AdminAccessPanel from '@/app/admin/page';
import { formatMonth } from '@/lib/utils';

const baseTabs = [
  { value: 'appearance', label: 'Aparência', Icon: Palette },
  { value: 'notifications', label: 'Notificações', Icon: Bell },
  { value: 'preferences', label: 'Preferências', Icon: SlidersHorizontal },
] as const;

export default function SettingsPage() {
  const { isAdmin, activeCycle } = useApp();
  const tabs = isAdmin ? [...baseTabs, { value: 'club', label: 'Clube', Icon: Gamepad2 }, { value: 'access', label: 'Acessos', Icon: ShieldCheck }] : baseTabs;
  return <div className="mx-auto max-w-3xl animate-fade-in">
    <h1 className="mb-5 text-2xl font-black tracking-tight sm:text-3xl">Configurações</h1>
    <Tabs.Root defaultValue="appearance">
      <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"><Tabs.List className="app-tabs flex w-max gap-1 rounded-2xl border border-white/8 bg-white/[.025] p-1.5">{tabs.map(({ value, label, Icon }) => <Tabs.Trigger key={value} value={value} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[11px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><Icon className="size-4" />{label}</Tabs.Trigger>)}</Tabs.List></div>
      <Tabs.Content value="appearance" className="outline-none data-[state=active]:animate-tab-in"><SettingCard title="Tema"><ThemeSelector compact /></SettingCard></Tabs.Content>
      <Tabs.Content value="notifications" className="outline-none data-[state=active]:animate-tab-in"><SettingCard title="Notificações"><div className="flex items-center justify-between gap-4"><span className="text-sm font-bold">Notificações push</span><PushNotificationButton /></div></SettingCard></Tabs.Content>
      <Tabs.Content value="preferences" className="outline-none data-[state=active]:animate-tab-in"><SettingCard title="Preferências"><MotionPreference /></SettingCard></Tabs.Content>
      {isAdmin && <Tabs.Content value="club" className="outline-none data-[state=active]:animate-tab-in"><SettingCard title="Clube"><div className="flex items-center gap-3"><img src={activeCycle?.game?.image_url} alt="" className="h-20 w-14 rounded-xl object-cover" /><div className="min-w-0 flex-1"><span className="text-[10px] font-black uppercase tracking-wider text-zinc-600">{activeCycle ? formatMonth(activeCycle.month, { includeYear: true }) : 'Ciclo atual'}</span><strong className="mt-1 block truncate text-sm">{activeCycle?.game?.title || 'Nenhum jogo definido'}</strong></div></div><div className="mt-4 grid grid-cols-2 gap-2"><Link href="/jogo-do-mes" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white/5 text-xs font-bold"><Gamepad2 className="size-4" />Jogo atual</Link><Link href="/ranking" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 text-xs font-bold text-white"><Trophy className="size-4" />Ranking</Link></div></SettingCard></Tabs.Content>}
      {isAdmin && <Tabs.Content value="access" className="mt-6 outline-none data-[state=active]:animate-tab-in"><AdminAccessPanel /></Tabs.Content>}
    </Tabs.Root>
  </div>;
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-5 rounded-3xl border border-white/8 bg-white/[.025] p-5"><h2 className="mb-4 text-base font-black">{title}</h2>{children}</section>; }

const motionEvent = 'clube-reduce-motion';
function MotionPreference() {
  const enabled = useSyncExternalStore(
    callback => { window.addEventListener(motionEvent, callback); return () => window.removeEventListener(motionEvent, callback); },
    () => localStorage.getItem('clube-do-jogo:reduce-motion') === 'true',
    () => false,
  );
  return <label className="flex min-h-12 items-center justify-between gap-4 text-sm font-bold"><span>Reduzir movimento</span><input type="checkbox" checked={enabled} className="size-5 accent-violet-500" onChange={event => { const value = event.target.checked; document.documentElement.dataset.reduceMotion = value ? 'true' : 'false'; localStorage.setItem('clube-do-jogo:reduce-motion', String(value)); window.dispatchEvent(new Event(motionEvent)); }} /></label>;
}
