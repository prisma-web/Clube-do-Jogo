'use client';

import { apiFetch } from '@/lib/api-client';

import { useState } from 'react';
import { Check, UserRound } from 'lucide-react';
import { useStaleQuery } from '@/hooks/use-stale-query';
import { useUrlDialog } from '@/hooks/use-url-state';
import type { AvatarCrop } from '@/lib/types';
import { useApp } from './app-provider';
import { ImageGalleryDialog } from './game-gallery';
import { AvatarCropEditor, DEFAULT_AVATAR_SELECTION_CROP } from './avatar-crop-editor';
import { normalizeAvatarCrop } from './ui/avatar';

interface Mugshot {
  id: number;
  name: string;
  image_url: string;
}

export function GameMugshots({ gameId, title }: { gameId: string; title: string }) {
  const { isDemo, profile, updateProfile, notify } = useApp();
  const [updatingUrl, setUpdatingUrl] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<Mugshot | null>(null);
  const gallery = useUrlDialog('gallery', { source: `game-mugshots-${gameId}` });
  const query = useStaleQuery<{ mugshots: Mugshot[] }>(
    `game-mugshots:${gameId}`,
    async () => {
      const response = await apiFetch(`/api/games/${gameId}/mugshots`);
      if (!response.ok) throw new Error('Não foi possível buscar os personagens.');
      return response.json();
    },
    !isDemo,
    { staleTime: 300_000 },
  );
  const mugshots = query.data?.mugshots || [];
  const images = mugshots.map(mugshot => mugshot.image_url);
  const requestedIndex = Number(gallery.getParam('image') || 0);
  const activeIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < images.length ? requestedIndex : 0;

  function cropFor(mugshot: Mugshot): AvatarCrop {
    return profile?.avatar_url === mugshot.image_url ? normalizeAvatarCrop(profile.avatar_crop) : DEFAULT_AVATAR_SELECTION_CROP;
  }

  async function chooseAvatar(mugshot: Mugshot, avatarCrop: AvatarCrop) {
    if (updatingUrl) return;
    setUpdatingUrl(mugshot.image_url);
    const saved = await updateProfile({ avatar_url: mugshot.image_url, avatar_crop: normalizeAvatarCrop(avatarCrop) });
    setUpdatingUrl(null);
    if (saved) {
      setCropTarget(null);
      notify(`${mugshot.name} agora representa seu perfil.`);
    }
  }

  if (isDemo || (!query.isInitialLoading && !mugshots.length)) return null;

  return (
    <section className="game-detail-surface game-detail-mugshots overflow-hidden rounded-3xl border border-white/8 bg-white/[.035] p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2"><UserRound className="size-4 text-zinc-400" /><h2 className="text-base font-black tracking-tight">Mugshots</h2></div>
      {query.isInitialLoading ? <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-2xl bg-white/[.06]" />)}</div> : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {mugshots.map((mugshot, index) => {
            const selected = profile?.avatar_url === mugshot.image_url;
            const updating = updatingUrl === mugshot.image_url;
            return <article key={mugshot.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-white/8 bg-black/20">
              <button type="button" onClick={() => gallery.show({ image: index })} aria-label={`Ampliar retrato de ${mugshot.name}`} className="absolute inset-0 cursor-zoom-in">
                <img src={mugshot.image_url} alt={mugshot.name} className="size-full object-cover transition duration-300 group-hover:scale-105" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-8 text-left"><span className="block truncate text-[10px] font-extrabold text-white">{mugshot.name}</span></div>
              </button>
              <button type="button" disabled={updating} onClick={() => setCropTarget(mugshot)} aria-label={selected ? `Ajustar o avatar ${mugshot.name}` : `Usar ${mugshot.name} como avatar`} title={selected ? 'Ajustar enquadramento' : 'Usar como avatar'} className={`absolute right-2 top-2 grid size-8 place-items-center rounded-full border shadow-lg transition disabled:cursor-default ${selected ? 'border-emerald-300/40 bg-emerald-500 text-white' : 'border-white/15 bg-black/65 text-white hover:bg-violet-600'}`}>
                {selected ? <Check className="size-4" /> : <UserRound className={`size-4 ${updating ? 'animate-pulse' : ''}`} />}
              </button>
            </article>;
          })}
        </div>
      )}
      <p className="mt-4 text-[10px] font-medium text-zinc-500">Personagens associados a {title} pela IGDB.</p>
      <ImageGalleryDialog title={`Mugshots de ${title}`} images={images} open={gallery.open} onOpenChange={open => { if (!open) gallery.close(); }} activeIndex={activeIndex} onActiveIndexChange={index => gallery.setParam('image', index)} />
      <AvatarCropEditor key={cropTarget?.id ?? 'empty'} imageUrl={cropTarget?.image_url || null} name={cropTarget?.name || ''} crop={cropTarget ? cropFor(cropTarget) : DEFAULT_AVATAR_SELECTION_CROP} open={Boolean(cropTarget)} saving={Boolean(updatingUrl)} onOpenChange={open => { if (!open && !updatingUrl) setCropTarget(null); }} onSave={crop => { if (cropTarget) void chooseAvatar(cropTarget, crop); }} />
    </section>
  );
}
