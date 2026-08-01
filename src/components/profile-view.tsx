'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CalendarDays, Flag, Gamepad2, Heart, Library, Pencil, Save, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchProfileWithGames } from '@/lib/data';
import { formatDate } from '@/lib/utils';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useApp } from './app-provider';
import { Avatar } from './ui/avatar';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { GameListCard } from './game-list-card';
import { FavoriteGameCard } from './favorite-game-card';
import { PlatformCard } from './platform-card';
import { ListSkeleton, Skeleton } from './ui/skeleton';
import { useUrlDialog, useUrlTab } from '@/hooks/use-url-state';

export function ProfileView({ profileId, own = false }: { profileId: string; own?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { isDemo, refreshProfile, runOptimistic } = useApp();
  const query = useStaleQuery(`profile:${profileId}`, () => fetchProfileWithGames(supabase, profileId, isDemo));
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [backlogParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const [completedParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const [favoritesParent] = useAutoAnimate<HTMLDivElement>({ duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  const data = query.data;
  const editDialog = useUrlDialog('edit-profile', { item: profileId });
  const [activeTab, setActiveTab] = useUrlTab('list', ['favorites', 'backlog', 'completed', 'platforms'] as const, 'favorites');
  const initializedEdit = useRef(false);

  useEffect(() => {
    if (!editDialog.open) {
      initializedEdit.current = false;
      return;
    }
    if (!data?.profile || initializedEdit.current) return;
    initializedEdit.current = true;
    setName(data.profile.name || '');
    setBio(data.profile.bio || '');
    setAvatar(data.profile.avatar_url || '');
  }, [data?.profile, editDialog.open]);

  async function saveProfile() {
    if (!data?.profile) return;
    setSaving(true);
    const patch = { name: name.trim() || data.profile.name || 'Membro', bio: bio.trim() || null, avatar_url: avatar.trim() || null, updated_at: new Date().toISOString() };
    const next = { ...data, profile: { ...data.profile, ...patch } };
    let saved = true;
    if (isDemo) query.setData(next);
    else saved = await runOptimistic('Atualizando perfil…', () => query.setData(next), () => query.setData(data), () => supabase.from('profiles').update(patch).eq('id', profileId));
    if (saved) {
      await refreshProfile();
      editDialog.close();
    }
    setSaving(false);
  }

  if (query.isInitialLoading) return <div className="mx-auto max-w-3xl"><div className="mb-8 text-center"><Skeleton className="mx-auto size-24 rounded-full" /><Skeleton className="mx-auto mt-4 h-7 w-44" /><Skeleton className="mx-auto mt-2 h-4 w-64" /></div><ListSkeleton /></div>;
  if (!data?.profile) return <div className="grid min-h-[60dvh] place-items-center text-center"><div><UserRound className="mx-auto size-9 text-zinc-700" /><h1 className="mt-3 text-lg font-black">Perfil não encontrado</h1></div></div>;

  const person = data.profile;
  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <section className="profile-hero relative mb-7 rounded-[30px] border border-white/8 bg-white/[0.025] p-6 text-center">
        <div className="profile-hero-glow pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-violet-500/10 to-transparent" />
        {own && <Dialog open={editDialog.open} onOpenChange={open => open ? editDialog.show() : editDialog.close()}><DialogTrigger asChild><button aria-label="Editar perfil" title="Editar perfil" className="profile-hero-action profile-edit-action absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200 transition hover:bg-violet-500/20 hover:text-white"><Pencil className="size-4" /></button></DialogTrigger><DialogContent title="Editar perfil"><div className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Nome</span><input value={name} onChange={event => setName(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-violet-500" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Sobre você</span><textarea value={bio} onChange={event => setBio(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm outline-none focus:border-violet-500" /></label><div><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500">URL do avatar</span><div className="flex items-center gap-3"><Avatar src={avatar || null} name={name} className="size-12 shrink-0" /><label className="relative min-w-0 flex-1"><input type="url" value={avatar} onChange={event => setAvatar(event.target.value)} placeholder="https://…" className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 pr-10 text-sm outline-none focus:border-violet-500" />{avatar && <button type="button" onClick={() => setAvatar('')} aria-label="Limpar URL do avatar" className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-zinc-500 hover:bg-white/8 hover:text-zinc-200"><X className="size-4" /></button>}</label></div></div><button disabled={saving} onClick={() => void saveProfile()} className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-violet-600 px-4 text-sm font-extrabold disabled:opacity-50"><Save className="size-4" />{saving ? 'Salvando…' : 'Salvar alterações'}</button></div></DialogContent></Dialog>}
        <div className="profile-avatar-wrap relative mx-auto w-fit p-2"><Avatar src={person.avatar_url} name={person.name} className="size-24 border-2 border-violet-400/25 text-xl shadow-xl" /></div>
        <h1 className="mt-4 text-2xl font-black tracking-tight">{person.name || 'Membro do clube'}</h1>
        {person.bio && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{person.bio}</p>}
        <div className="profile-stat-list mx-auto mt-4 grid max-w-md grid-cols-2 gap-2 text-[10px] font-bold text-zinc-500 sm:max-w-2xl sm:grid-cols-4"><span className="profile-stat inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1.5"><Heart className="size-3" />{data.favorites.length} favoritos</span><span className="profile-stat inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1.5"><Library className="size-3" />{data.backlog.length} em Meus Jogos</span><span className="profile-stat inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1.5"><Flag className="size-3" />{data.completed.length} finalizados</span><span className="profile-stat inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white/5 px-2.5 py-1.5"><Gamepad2 className="size-3" />{data.platforms.length} consoles</span></div>
        {person.created_at && <div className="profile-since mt-2 flex justify-center text-[10px] font-bold text-zinc-500"><span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarDays className="size-3" />Desde {formatDate(person.created_at)}</span></div>}
      </section>

      <Tabs.Root value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)}>
        <Tabs.List className="app-tabs mb-5 grid grid-cols-4 rounded-2xl border border-white/8 bg-white/[0.025] p-1.5"><Tabs.Trigger value="favorites" className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-pink-500/10 data-[state=active]:text-pink-300"><Heart className="size-4" /><span>{data.favorites.length} Favoritos</span></Tabs.Trigger><Tabs.Trigger value="backlog" className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300"><Library className="size-4" /><span>{data.backlog.length} Jogos</span></Tabs.Trigger><Tabs.Trigger value="completed" className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-300"><Flag className="size-4" /><span>{data.completed.length} Finalizados</span></Tabs.Trigger><Tabs.Trigger value="platforms" className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-extrabold text-zinc-500 outline-none data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300"><Gamepad2 className="size-4" /><span>{data.platforms.length} Consoles</span></Tabs.Trigger></Tabs.List>
        <Tabs.Content value="favorites" className="outline-none data-[state=active]:animate-fade-in">{data.favorites.length ? <div ref={favoritesParent} className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">{data.favorites.map(game => <FavoriteGameCard key={game.id} game={game} />)}</div> : <Empty text="Nenhum jogo favorito." />}</Tabs.Content>
        <Tabs.Content value="backlog" className="outline-none data-[state=active]:animate-fade-in">{data.backlog.length ? <div ref={backlogParent} className="space-y-3">{data.backlog.map(game => <GameListCard key={game.id} game={game} />)}</div> : <Empty text="Nenhum jogo adicionado." />}</Tabs.Content>
        <Tabs.Content value="completed" className="outline-none data-[state=active]:animate-fade-in">{data.completed.length ? <div ref={completedParent} className="space-y-3">{data.completed.map(game => <GameListCard key={game.id} game={game} />)}</div> : <Empty text="Nenhum jogo finalizado." />}</Tabs.Content>
        <Tabs.Content value="platforms" className="outline-none data-[state=active]:animate-fade-in">{data.platforms.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{data.platforms.map(platform => <PlatformCard key={platform.igdb_platform_id} platform={platform} />)}</div> : <Empty text="Nenhum console adicionado." />}</Tabs.Content>
      </Tabs.Root>

    </div>
  );
}

function Empty({ text }: { text: string }) { return <div className="grid min-h-52 place-items-center rounded-3xl border border-dashed border-white/10 text-center"><div><Gamepad2 className="mx-auto size-8 text-zinc-700" /><p className="mt-3 text-sm text-zinc-500">{text}</p></div></div>; }
