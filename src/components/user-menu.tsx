'use client';

import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { useApp } from './app-provider';
import { Avatar } from './ui/avatar';

export function UserMenu({ desktop = false }: { desktop?: boolean }) {
  const { profile, isAdmin, signOut } = useApp();
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>{desktop
      ? <button aria-label="Abrir menu da conta" className="flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/5"><Avatar src={profile?.avatar_url} name={profile?.name} className="size-10 shrink-0" /><span className="min-w-0"><strong className="block truncate text-xs text-zinc-200">{profile?.name || 'Meu perfil'}</strong><span className="mt-0.5 block text-[10px] text-zinc-600">{isAdmin ? 'Administrador' : 'Minha conta'}</span></span></button>
      : <button aria-label="Abrir menu da conta"><Avatar src={profile?.avatar_url} name={profile?.name} className="size-9" /></button>}
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content align={desktop ? 'start' : 'end'} side={desktop ? 'right' : 'bottom'} sideOffset={8} collisionPadding={12} className="app-popup animated-popup z-[120] min-w-52 rounded-2xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl outline-none">
      <DropdownMenu.Item asChild><Link href="/perfil" scroll={false} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold outline-none data-[highlighted]:bg-white/8"><UserRound className="size-4" />Ver perfil</Link></DropdownMenu.Item>
      <DropdownMenu.Item asChild><Link href="/configuracoes" scroll={false} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold outline-none data-[highlighted]:bg-white/8"><Settings className="size-4" />Configurações</Link></DropdownMenu.Item>
      <DropdownMenu.Separator className="my-1 h-px bg-white/8" />
      <DropdownMenu.Item onSelect={() => void signOut()} className="danger-action flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-red-300 outline-none data-[highlighted]:bg-red-500/10"><LogOut className="size-4" />Deslogar</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
