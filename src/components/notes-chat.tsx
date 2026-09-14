'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { Check, ChevronDown, ImagePlus, Pencil, Send, Trash2, X } from 'lucide-react';
import type { Game, LocalNote } from '@/lib/types';
import { deleteNote, loadNotes, saveNote } from '@/lib/local-notes';
import {
  createSupabaseNotesRemote,
  rememberConfirmedDeletion,
  rememberConfirmedNote,
  resolveNoteConflict,
  StaleNoteConflictError,
  syncNotes,
  type NotesConflictResolution,
  type NotesSyncConflict,
  type NotesSyncResult,
} from '@/lib/notes-sync';
import { formatDate, formatTime } from '@/lib/utils';
import { useApp } from './app-provider';
import { Skeleton } from './ui/skeleton';
import { ImageGalleryDialog } from './game-gallery';
import { useUrlDialog } from '@/hooks/use-url-state';
import { createClient } from '@/lib/supabase/client';

function dateKey(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Fortaleza' }).format(new Date(value));
}

function resolutionLabel(resolution: NotesConflictResolution): string {
  switch (resolution) {
    case 'use-local': return 'Manter minha versão';
    case 'use-remote': return 'Usar versão do servidor';
    case 'restore-local': return 'Restaurar minha versão';
    case 'accept-remote-deletion': return 'Aceitar exclusão';
    default: return resolution;
  }
}

type NotesChatProps = { game: Game; snapshotMonth?: string };

export function NotesChat(props: NotesChatProps) {
  const { user, isDemo } = useApp();
  return <ScopedNotesChat key={`${user?.id}:${isDemo}:${props.game.id}:${props.snapshotMonth || 'live'}`} {...props} />;
}

function ScopedNotesChat({ game, snapshotMonth }: NotesChatProps) {
  const supabase = useMemo(() => createClient(), []);
  const notesRemote = useMemo(() => createSupabaseNotesRemote(supabase), [supabase]);
  const { user, isDemo, runOptimistic } = useApp();
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [syncResult, setSyncResult] = useState<NotesSyncResult>();
  const [localCacheError, setLocalCacheError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [conflictErrors, setConflictErrors] = useState<Record<string, string>>({});
  const generationRef = useRef(0);
  const [body, setBody] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuNoteId, setMenuNoteId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const gallery = useUrlDialog('gallery', { source: `notes-${game.id}-${snapshotMonth || 'latest'}` });
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    generationRef.current += 1;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setLoading(true);
      setSyncResult(undefined);
      setLocalCacheError(false);
      void (async () => {
        if (snapshotMonth) {
          if (isDemo) return loadNotes(user!.id, game.id);
          const { data, error } = await supabase
            .from('cycle_note_snapshots')
            .select('*')
            .eq('user_id', user!.id)
            .eq('cycle_month', snapshotMonth)
            .eq('game_id', game.id)
            .order('created_at');
          if (error) throw error;
          return (data || []).map(note => ({ id: note.note_id, userId: note.user_id, gameId: note.game_id, body: note.body, imageDataUrl: note.image_data_url || undefined, createdAt: note.created_at, updatedAt: note.updated_at } satisfies LocalNote));
        }
        if (isDemo) return loadNotes(user!.id, game.id);
        const result = await syncNotes({ userId: user!.id, gameId: game.id }, { remote: notesRemote });
        if (alive) setSyncResult(result);
        return result.notes;
      })().catch(async () => {
        if (alive) setLocalCacheError(true);
        return snapshotMonth ? [] : loadNotes(user!.id, game.id);
      }).then(items => { if (alive) setNotes(items); }).finally(() => { if (alive) setLoading(false); });
    });
    return () => { alive = false; generationRef.current += 1; };
  }, [game.id, isDemo, notesRemote, snapshotMonth, supabase, user]);

  useEffect(() => {
    if (!loading && notes.length) requestAnimationFrame(() => virtuosoRef.current?.scrollToIndex({ index: notes.length - 1, align: 'end' }));
  }, [loading, notes.length]);

  async function submit() {
    if (!body.trim() && !imageDataUrl) return;
    const previousBody = body;
    const previousImage = imageDataUrl;
    const previousEditingId = editingId;
    const now = new Date().toISOString();
    const previous = notes;
    let nextNotes: LocalNote[];
    let noteToSave: LocalNote;
    let expectedRemoteUpdatedAt: string | undefined;
    if (editingId) {
      const existing = notes.find(note => note.id === editingId);
      if (!existing) return;
      expectedRemoteUpdatedAt = existing.updatedAt;
      noteToSave = { ...existing, body: body.trim(), updatedAt: now };
      nextNotes = notes.map(item => item.id === editingId ? noteToSave : item);
    } else {
      noteToSave = { id: crypto.randomUUID(), userId: user!.id, gameId: game.id, body: body.trim(), imageDataUrl, createdAt: now, updatedAt: now };
      nextNotes = [...notes, noteToSave];
    }
    setBody('');
    setImageDataUrl(undefined);
    setEditingId(null);
    const saved = await runOptimistic(editingId ? 'Salvando anotação…' : 'Criando anotação…', () => setNotes(nextNotes), () => setNotes(previous), () => isDemo
      ? saveNote(noteToSave)
      : (async () => {
          const confirmed = expectedRemoteUpdatedAt
            ? await notesRemote.update(noteToSave, expectedRemoteUpdatedAt)
            : await notesRemote.insert(noteToSave);
          if (!confirmed) throw new StaleNoteConflictError(noteToSave.id);
          try {
            await rememberConfirmedNote(noteToSave, confirmed);
          } catch {
            setLocalCacheError(true);
          }
        })());
    if (!saved) {
      setBody(previousBody);
      setImageDataUrl(previousImage);
      setEditingId(previousEditingId);
    }
  }

  function pickImage(file?: File) {
    if (!file) return;
    if (file.size > 4_000_000) {
      setImageError('Escolha uma imagem de até 4 MB.');
      return;
    }
    setImageError('');
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  function beginEdit(note: LocalNote) {
    setEditingId(note.id);
    setBody(note.body);
    setImageDataUrl(undefined);
  }

  async function remove(id: string) {
    const previous = notes;
    const next = notes.filter(item => item.id !== id);
    const deleting = notes.find(item => item.id === id);
    if (!deleting) return;
    await runOptimistic('Excluindo anotação…', () => setNotes(next), () => setNotes(previous), async () => {
      if (isDemo) return deleteNote(id);
      const { data, error } = await supabase.from('game_notes').delete().eq('id', id).eq('user_id', user!.id).eq('game_id', game.id).eq('updated_at', deleting.updatedAt).select('id');
      if (error) throw error;
      if (!data?.length) {
        const stillRemote = await notesRemote.get({ userId: user!.id, gameId: game.id }, id);
        if (stillRemote) throw new StaleNoteConflictError(id);
      }
      try {
        await rememberConfirmedDeletion({ userId: user!.id, gameId: game.id }, id);
      } catch {
        setLocalCacheError(true);
        await deleteNote(id).catch(() => undefined);
      }
    });
    if (editingId === id) { setEditingId(null); setBody(''); }
  }

  async function resync() {
    if (isDemo || snapshotMonth) return;
    const token = generationRef.current;
    setSyncing(true);
    try {
      const result = await syncNotes({ userId: user!.id, gameId: game.id }, { remote: notesRemote });
      if (token !== generationRef.current) return;
      setSyncResult(result);
      setNotes(result.notes);
      setLocalCacheError(false);
    } catch {
      if (token !== generationRef.current) return;
      setLocalCacheError(true);
    } finally {
      if (token === generationRef.current) setSyncing(false);
    }
  }

  function manualResync() {
    setRetryCount(count => count + 1);
    void resync();
  }

  async function resolveConflict(conflict: NotesSyncConflict, resolution: NotesConflictResolution) {
    const token = generationRef.current;
    setResolvingId(conflict.noteId);
    setConflictErrors(current => ({ ...current, [conflict.noteId]: '' }));
    try {
      await resolveNoteConflict({ userId: user!.id, gameId: game.id }, conflict.noteId, resolution, { remote: notesRemote });
      if (token !== generationRef.current) return;
      await resync();
    } catch (error) {
      if (token !== generationRef.current) return;
      const message = error instanceof Error ? error.message : 'Não foi possível resolver o conflito.';
      setConflictErrors(current => ({ ...current, [conflict.noteId]: message }));
    } finally {
      if (token === generationRef.current) setResolvingId(null);
    }
  }

  if (loading) return <div className="space-y-3 p-4"><Skeleton className="h-16 w-3/4" /><Skeleton className="ml-auto h-24 w-4/5" /><Skeleton className="h-20 w-2/3" /></div>;
  const conflicts = syncResult?.conflicts || [];
  const noteImages = notes.flatMap(note => note.imageDataUrl ? [note.imageDataUrl] : []);
  const requestedGalleryIndex = Number(gallery.getParam('image') || 0);
  const galleryIndex = Number.isInteger(requestedGalleryIndex) && requestedGalleryIndex >= 0 && requestedGalleryIndex < noteImages.length ? requestedGalleryIndex : 0;

  return (
    <div className="notes-panel overflow-hidden rounded-3xl border border-white/8 bg-[radial-gradient(circle_at_20%_0%,rgba(124,58,237,.08),transparent_45%),#0c0c0f]">
      <div
        className="border-b border-white/8 px-4 py-3"
        data-note-sync-conflicts={syncResult?.summary.conflicts || 0}
        data-note-sync-errors={(syncResult?.summary.errors || 0) + Number(localCacheError)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold">Minhas anotações</h2>
          {!isDemo && !snapshotMonth && (syncResult?.summary.conflicts || syncResult?.summary.errors || localCacheError) && (
            <span className="text-[10px] font-bold text-amber-300">
              {(syncResult?.summary.conflicts || 0) > 0 ? `${syncResult!.summary.conflicts} conflito(s)` : 'Falha ao sincronizar'}
            </span>
          )}
        </div>
        {!isDemo && !snapshotMonth && syncResult && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-zinc-500">
            <span>{syncResult.summary.synced} sincronizada(s)</span>
            {syncResult.summary.pending > 0 && <span className="text-amber-300">{syncResult.summary.pending} pendente(s)</span>}
            {((syncResult.summary.errors || 0) > 0 || localCacheError) && (
              <span className="text-red-300">Falha na sincronização{retryCount > 0 ? ` · tentativa ${retryCount}` : ''}</span>
            )}
            {((syncResult.summary.conflicts || 0) > 0 || (syncResult.summary.errors || 0) > 0 || localCacheError) && (
              <button
                type="button"
                onClick={manualResync}
                disabled={syncing}
                className="rounded-full bg-white/10 px-2 py-1 text-zinc-300 transition hover:bg-white/15 disabled:opacity-50"
              >
                {syncing ? 'Sincronizando…' : 'Sincronizar novamente'}
              </button>
            )}
          </div>
        )}
      </div>
      {!isDemo && !snapshotMonth && conflicts.length > 0 && (
        <div className="space-y-3 border-b border-white/8 bg-amber-500/5 p-4">
          <p className="text-xs font-bold text-amber-200">
            {conflicts.length} {conflicts.length === 1 ? 'anotação precisa' : 'anotações precisam'} de revisão
          </p>
          {conflicts.map(conflict => (
            <div key={conflict.noteId} className="rounded-2xl border border-amber-400/20 bg-black/30 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Sua versão</p>
                  {conflict.local.imageDataUrl && <img src={conflict.local.imageDataUrl} alt="Imagem da sua versão" className="mt-1 h-20 w-full rounded-lg object-cover" />}
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-zinc-300">{conflict.local.body || '(sem texto)'}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">{formatDate(conflict.local.updatedAt)} · {formatTime(conflict.local.updatedAt)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                  <p className="text-[10px] font-bold uppercase text-zinc-500">Versão do servidor</p>
                  {conflict.remote ? (
                    <>
                      {conflict.remote.imageDataUrl && <img src={conflict.remote.imageDataUrl} alt="Imagem da versão do servidor" className="mt-1 h-20 w-full rounded-lg object-cover" />}
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-zinc-300">{conflict.remote.body || '(sem texto)'}</p>
                      <p className="mt-1 text-[10px] text-zinc-600">{formatDate(conflict.remote.updatedAt)} · {formatTime(conflict.remote.updatedAt)}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">Removida no servidor.</p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {conflict.resolutions.map(resolution => (
                  <button
                    key={resolution}
                    type="button"
                    disabled={resolvingId === conflict.noteId}
                    onClick={() => void resolveConflict(conflict, resolution)}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-zinc-200 transition hover:bg-white/15 disabled:opacity-50"
                  >
                    {resolvingId === conflict.noteId ? 'Aplicando…' : resolutionLabel(resolution)}
                  </button>
                ))}
              </div>
              {conflictErrors[conflict.noteId] && <p className="mt-2 text-[10px] font-bold text-red-300">{conflictErrors[conflict.noteId]}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="h-[min(56dvh,560px)] min-h-80">
        {notes.length === 0 ? <div className="grid h-full place-items-center px-8 text-center"><div><Pencil className="mx-auto size-7 text-zinc-700" /><p className="mt-3 text-sm font-bold text-zinc-400">{snapshotMonth ? 'Nenhuma anotação neste ciclo' : 'Guarde ideias para a reunião'}</p><p className="mt-1 text-xs leading-relaxed text-zinc-600">{snapshotMonth ? 'Não havia anotações registradas quando o ciclo foi encerrado.' : 'Registre detalhes, teorias e momentos do jogo conforme avança.'}</p></div></div> : (
          <Virtuoso ref={virtuosoRef} data={notes} followOutput="smooth" itemContent={(index, note) => {
            const showDate = index === 0 || dateKey(notes[index - 1].createdAt) !== dateKey(note.createdAt);
            return (
              <div className="px-3">
                {showDate && <div className="my-4 text-center"><span className="rounded-full border border-white/8 bg-zinc-900 px-3 py-1 text-[10px] font-bold text-zinc-500">{formatDate(note.createdAt)}</span></div>}
                <div className="mb-2 flex justify-end">
                  <div onPointerDown={() => { holdTimer.current = setTimeout(() => setMenuNoteId(note.id), 520); }} onPointerUp={() => { if (holdTimer.current) clearTimeout(holdTimer.current); }} onPointerCancel={() => { if (holdTimer.current) clearTimeout(holdTimer.current); }} className="notes-message relative min-w-36 max-w-[88%] overflow-hidden rounded-2xl rounded-br-md border border-violet-400/15 bg-violet-600/18 shadow-sm">
                    {!snapshotMonth && <DropdownMenu.Root open={menuNoteId === note.id} onOpenChange={open => setMenuNoteId(open ? note.id : null)}>
                      <DropdownMenu.Trigger aria-label="Opções da anotação" className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full text-white/55 transition hover:text-white"><ChevronDown className="size-3.5" /></DropdownMenu.Trigger>
                      <DropdownMenu.Portal><DropdownMenu.Content align="end" className="app-popup animated-popup z-[100] min-w-36 rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl">
                        <DropdownMenu.Item onSelect={() => beginEdit(note)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-zinc-300 outline-none data-[highlighted]:bg-white/8"><Pencil className="size-3.5" />Editar</DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => void remove(note.id)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-300 outline-none data-[highlighted]:bg-red-500/10"><Trash2 className="size-3.5" />Excluir</DropdownMenu.Item>
                      </DropdownMenu.Content></DropdownMenu.Portal>
                    </DropdownMenu.Root>}
                    {note.imageDataUrl && <button onClick={() => gallery.show({ image: noteImages.indexOf(note.imageDataUrl!) })} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} className="notes-image group relative block w-full cursor-zoom-in overflow-hidden"><img src={note.imageDataUrl} alt="Abrir imagem anexada à anotação" className="block aspect-video max-h-72 w-full object-cover transition duration-200 group-hover:scale-[1.02]" /><span className="notes-image-overlay pointer-events-none absolute inset-0 transition" /></button>}
                    {(note.body || !note.imageDataUrl) && <p className={`whitespace-pre-wrap break-words pb-2 pl-3 pt-4 text-sm leading-relaxed text-zinc-100 ${snapshotMonth ? 'pr-3' : 'pr-12'}`}>{note.body}</p>}
                    <div className="flex items-center justify-end gap-1 px-3 pb-2 text-[9px] text-violet-200/45">{note.updatedAt !== note.createdAt && 'editada · '}{formatTime(note.createdAt)}<Check className="size-3" /></div>
                  </div>
                </div>
              </div>
            );
          }} />
        )}
      </div>
      {!snapshotMonth && <div className="border-t border-white/8 bg-black/20 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
        <>
            {editingId && <div className="mb-2 flex items-center justify-between rounded-xl bg-violet-500/10 px-3 py-2 text-[11px] text-violet-300"><span className="truncate">Editando anotação</span><button aria-label="Cancelar edição" onClick={() => { setEditingId(null); setBody(''); }} className="grid size-6 place-items-center"><X className="size-3.5" /></button></div>}
            {imageError && <div className="mb-2 text-[10px] font-bold text-red-300">{imageError}</div>}
            {imageDataUrl && <div className="relative mb-2 inline-block"><img src={imageDataUrl} alt="Prévia" className="h-20 max-w-40 rounded-xl object-cover" /><button aria-label="Remover imagem" onClick={() => setImageDataUrl(undefined)} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-zinc-100 text-zinc-950"><X className="size-3" /></button></div>}
            <div className="flex items-end gap-2">
              {!editingId && <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white/5 text-zinc-400 transition hover:bg-white/10"><ImagePlus className="size-4" /><input type="file" accept="image/*" className="sr-only" onChange={event => pickImage(event.target.files?.[0])} /></label>}
              <textarea value={body} onChange={event => setBody(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={1} placeholder="Anote uma ideia…" className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-violet-500" />
              <button aria-label="Salvar anotação" onClick={() => void submit()} disabled={!body.trim() && !imageDataUrl} className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-600 text-white transition active:scale-90 disabled:bg-zinc-800 disabled:text-zinc-600"><Send className="size-4" /></button>
            </div>
        </>
      </div>}
      <ImageGalleryDialog title="anotações" images={noteImages} open={gallery.open} onOpenChange={open => { if (!open) gallery.close(); }} activeIndex={galleryIndex} onActiveIndexChange={index => gallery.setParam('image', index)} />
    </div>
  );
}
