import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { ImageGalleryModal } from '@/features/media/ImageGalleryModal';
import { useAppInternal } from '@/state/app-provider';
import { summarizeNotesSync, type NotesSyncSummary } from '@/state/notes-offline-cache';
import { useNotesOfflineCache } from '@/state/use-notes-offline-cache';
import { createNativeNoteId, mergePendingIntoList, useDeleteNote, useNoteDraft, useNotes, useNotesPendingQueue, type NoteConflict } from '@/state/discussion-queries';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { formatDate, formatShortDate, formatTime, type LocalNote } from '@clube-do-jogo/domain';
import { shouldShowDateSeparator } from './date-grouping';

const MAX_IMAGE_BYTES = 4_000_000;
// Mirrors the web's bounded chat panel (src/components/notes-chat.tsx `h-[min(56dvh,560px)]`),
// scaled to the device viewport instead of a CSS viewport unit.
const LIST_MAX_HEIGHT = Math.min(Dimensions.get('window').height * 0.56, 560);

type PrivateNotesProps = { gameId: string; snapshotMonth?: string };

export function PrivateNotes(props: PrivateNotesProps) {
  const { sessionEpoch, selectedMonth } = useAppInternal();
  return <NotesEditor key={`${sessionEpoch}:${props.gameId}:${props.snapshotMonth || selectedMonth}`} {...props} />;
}

function NotesEditor({ gameId, snapshotMonth }: PrivateNotesProps) {
  const colors = useThemeColors();
  const styles = useStyles();
  const { isDemo, isHistorical, selectedMonth, userId } = useAppInternal();
  const readOnly = Boolean(snapshotMonth) || isHistorical;

  const notesQuery = useNotes(gameId, { snapshotMonth });
  // Same snapshot useNotes resolves (snapshotFor in discussion-queries.ts).
  const offline = useNotesOfflineCache(gameId, snapshotMonth || (isHistorical ? selectedMonth : null), notesQuery);
  const deleteNote = useDeleteNote();
  const draftState = useNoteDraft(gameId);
  const pendingQueue = useNotesPendingQueue(gameId);

  const [imageError, setImageError] = useState('');
  const [picking, setPicking] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<LocalNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalNote | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const listRef = useRef<ScrollView>(null);

  // The server list when it answered; otherwise the last synced copy saved on this device.
  const fromCache = !notesQuery.data && Boolean(offline.cache);
  const confirmedNotes = notesQuery.data ?? offline.cache?.notes ?? [];
  const notes = mergePendingIntoList(confirmedNotes, pendingQueue.queue);
  const pendingIds = pendingQueue.queue;
  const syncSummary = summarizeNotesSync({
    confirmed: confirmedNotes,
    queue: pendingQueue.queue,
    conflicts: pendingQueue.conflicts,
    // A paused query (React Query offline) without data is a server that did not answer yet.
    serverError: notesQuery.isError || (!notesQuery.data && notesQuery.fetchStatus === 'paused'),
    fromCache,
    fetching: notesQuery.isFetching,
  });

  function syncAgain() {
    void notesQuery.refetch();
    pendingQueue.retryAll();
  }

  useEffect(() => {
    if (!notes.length) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, [notes.length]);

  const draft = draftState.draft;
  const editing = draft.target?.kind === 'edit' ? draft.target : null;
  const busy = draftState.loading || pendingQueue.loading;
  const conflictEntries = Array.from(pendingQueue.conflicts.entries());

  function beginEdit(note: LocalNote) {
    setActionsTarget(null);
    draftState.setDraft({ target: { kind: 'edit', id: note.id, createdAt: note.createdAt, expectedUpdatedAt: note.updatedAt }, body: note.body, imageDataUrl: note.imageDataUrl, updatedAt: new Date().toISOString() });
  }

  function cancelEdit() {
    draftState.clearDraft();
  }

  function submit() {
    const text = draft.body.trim();
    if (!text && !draft.imageDataUrl) return;
    if (busy || !userId) return;
    if (editing) {
      pendingQueue.submitUpdate(
        { id: editing.id, userId, gameId, body: text, imageDataUrl: draft.imageDataUrl, createdAt: editing.createdAt, updatedAt: new Date().toISOString() },
        editing.expectedUpdatedAt,
      );
      Keyboard.dismiss();
      draftState.clearDraft();
      return;
    }
    const target = draft.target || { kind: 'new' as const, id: createNativeNoteId(), createdAt: new Date().toISOString() };
    pendingQueue.submitCreate({ id: target.id, userId, gameId, body: text, imageDataUrl: draft.imageDataUrl, createdAt: target.createdAt, updatedAt: target.createdAt });
    Keyboard.dismiss();
    draftState.clearDraft();
  }

  function removeImage() {
    draftState.setDraft(current => ({ ...current, imageDataUrl: undefined, updatedAt: new Date().toISOString() }));
  }

  async function pickImage() {
    setImageError('');
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if ((asset.fileSize || 0) > MAX_IMAGE_BYTES || (asset.base64?.length || 0) * 0.75 > MAX_IMAGE_BYTES) {
        setImageError('Escolha uma imagem de até 4 MB.');
        return;
      }
      if (!asset.base64) {
        setImageError('Não foi possível carregar a imagem selecionada.');
        return;
      }
      const dataUrl = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
      draftState.setDraft(current => ({ ...current, imageDataUrl: dataUrl, updatedAt: new Date().toISOString() }));
    } catch {
      setImageError('Não foi possível abrir as fotos. Tente novamente.');
    } finally {
      setPicking(false);
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteNote.mutate({ gameId, noteId: deleteTarget.id, expectedUpdatedAt: deleteTarget.updatedAt }, {
      onSuccess: () => {
        if (editing?.id === deleteTarget.id) cancelEdit();
        setDeleteTarget(null);
      },
    });
  }

  const noteImages = notes.flatMap(note => note.imageDataUrl ? [note.imageDataUrl] : []);

  if (!notesQuery.data && !offline.cache && (notesQuery.isLoading || offline.loading)) {
    return <LoadingState label="Carregando anotações…" />;
  }
  if (notesQuery.isError && !offline.cache) {
    return <ErrorState message={notesQuery.error.message} onRetry={syncAgain} />;
  }

  return (
    <View style={styles.container}>
      {!readOnly && !isDemo ? (
        <View style={styles.syncNotice}>
          <Ionicons name="information-circle-outline" size={14} color={colors.zinc400} />
          <Text style={styles.syncNoticeText}>
            Anotações escritas sem conexão ficam guardadas neste aparelho e são enviadas automaticamente assim que a conexão voltar ou o app for reaberto.
          </Text>
        </View>
      ) : null}

      {!readOnly && !isDemo ? (
        <SyncStatusBar
          summary={syncSummary}
          cachedAt={fromCache ? offline.cache?.savedAt : undefined}
          syncing={notesQuery.isFetching}
          onRetry={syncAgain}
        />
      ) : null}

      {!readOnly && conflictEntries.length > 0 ? (
        <View style={styles.conflictPanel} testID="notes-conflicts">
          <Text style={styles.conflictHeading}>
            {conflictEntries.length} {conflictEntries.length === 1 ? 'anotação precisa' : 'anotações precisam'} de revisão
          </Text>
          {conflictEntries.map(([noteId, conflict]) => (
            <ConflictCard
              key={noteId}
              conflict={conflict}
              disabled={busy}
              onUseLocal={() => pendingQueue.resolveUseLocal(noteId)}
              onUseRemote={() => pendingQueue.resolveUseRemote(noteId)}
              onEditRemote={conflict.kind === 'changed' ? () => { pendingQueue.resolveUseRemote(noteId); beginEdit(conflict.remote); } : undefined}
              onAcceptDeletion={() => pendingQueue.resolveAcceptDeletion(noteId)}
              onKeepAsNew={() => pendingQueue.resolveKeepAsNew(noteId)}
            />
          ))}
        </View>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          icon="create-outline"
          title={snapshotMonth ? 'Nenhuma anotação neste ciclo' : 'Guarde ideias para a reunião'}
          description={snapshotMonth ? 'Não havia anotações registradas quando o ciclo foi encerrado.' : 'Registre detalhes, teorias e momentos do jogo conforme avança.'}
        />
      ) : (
        <ScrollView
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          nestedScrollEnabled
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        >
          {notes.map((note, index) => (
            <View key={note.id}>
              {shouldShowDateSeparator(notes[index - 1]?.createdAt, note.createdAt) ? (
                <View style={styles.dateSeparator}>
                  <Text style={styles.dateSeparatorText}>{formatDate(note.createdAt)}</Text>
                </View>
              ) : null}
              <View style={styles.bubbleRow}>
                <View style={[styles.bubble, pendingIds.has(note.id) && styles.bubblePending]}>
                  {!readOnly && !pendingIds.has(note.id) ? (
                    // Discoverable alternative to the long press (parity with the web's chevron menu).
                    <Pressable
                      onPress={() => setActionsTarget(note)}
                      accessibilityRole="button"
                      accessibilityLabel={`Opções da anotação de ${formatShortDate(note.createdAt)}`}
                      hitSlop={8}
                      style={styles.bubbleMenu}
                      testID={`note-menu-${note.id}`}
                    >
                      <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
                    </Pressable>
                  ) : null}
                  {note.imageDataUrl ? (
                    <Pressable
                      onPress={() => setGalleryIndex(noteImages.indexOf(note.imageDataUrl!))}
                      accessibilityRole="button"
                      accessibilityLabel="Abrir imagem da anotação"
                    >
                      <Image source={{ uri: note.imageDataUrl }} style={styles.bubbleImage} contentFit="cover" />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onLongPress={() => { if (!readOnly && !pendingIds.has(note.id)) setActionsTarget(note); }}
                    accessibilityRole={readOnly ? undefined : 'button'}
                    accessibilityLabel={readOnly ? undefined : `${note.body || "Anotação com imagem"}. Opções da anotação de ${formatShortDate(note.createdAt)}`}
                    testID={`note-row-${note.id}`}
                  >
                    {note.body ? <Text style={[styles.bubbleText, !readOnly && styles.bubbleTextWithMenu]}>{note.body}</Text> : null}
                    <View style={styles.bubbleFooter}>
                      {pendingIds.has(note.id) ? <Text style={styles.bubbleMeta}>enviando… · </Text>
                        : note.updatedAt !== note.createdAt ? <Text style={styles.bubbleMeta}>editada · </Text> : null}
                      <Text style={styles.bubbleMeta}>{formatTime(note.createdAt)}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {!readOnly ? (
        <View style={styles.composerCard}>
          {editing ? (
            <View style={styles.editingBanner}>
              <Text style={styles.editingBannerText}>Editando anotação</Text>
              <Pressable onPress={cancelEdit} accessibilityRole="button" accessibilityLabel="Cancelar edição" hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.violet300} />
              </Pressable>
            </View>
          ) : null}
          {imageError ? <Text style={styles.formError}>{imageError}</Text> : null}
          {draftState.error ? <Text style={styles.formError}>{draftState.error.message}</Text> : null}
          {pendingQueue.corruptionError ? <Text style={styles.formError}>{pendingQueue.corruptionError.message}</Text> : null}
          {draft.imageDataUrl ? (
            <View style={styles.previewRow}>
              <Image source={{ uri: draft.imageDataUrl }} style={styles.previewImage} contentFit="cover" />
              <Pressable onPress={removeImage} accessibilityRole="button" accessibilityLabel="Remover imagem" style={styles.previewRemove}>
                <Ionicons name="close" size={13} color={colors.zinc950} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <Pressable
              onPress={() => void pickImage()}
              disabled={picking || busy}
              accessibilityRole="button"
              accessibilityLabel="Anexar imagem"
              style={styles.imageButton}
            >
              <Ionicons name="image-outline" size={18} color={colors.zinc400} />
            </Pressable>
            <TextInput
              editable={!busy}
              value={draft.body}
              onChangeText={text => draftState.setDraft(current => ({ ...current, body: text, updatedAt: new Date().toISOString() }))}
              placeholder="Anote uma ideia…"
              placeholderTextColor={colors.zinc600}
              multiline
              style={styles.composerInput}
              testID="private-notes-input"
              accessibilityLabel="Escrever anotação"
            />
            <Pressable
              onPress={submit}
              disabled={(!draft.body.trim() && !draft.imageDataUrl) || busy}
              accessibilityRole="button"
              accessibilityLabel="Salvar anotação"
              style={[styles.sendButton, (!draft.body.trim() && !draft.imageDataUrl) && styles.sendButtonDisabled]}
            >
              <Ionicons name="send" size={16} color={colors.white} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <Sheet visible={Boolean(actionsTarget)} title="Anotação" onClose={() => setActionsTarget(null)}>
        <View style={styles.actionsBody}>
          <Button label="Editar" variant="secondary" onPress={() => actionsTarget && beginEdit(actionsTarget)} />
          <Button
            label="Excluir"
            variant="danger"
            onPress={() => {
              setDeleteTarget(actionsTarget);
              setActionsTarget(null);
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={Boolean(deleteTarget)} title="Apagar anotação?" onClose={() => setDeleteTarget(null)}>
        <View style={styles.actionsBody}>
          <Text style={styles.deleteText}>Esta ação não pode ser desfeita.</Text>
          {deleteNote.isError ? <Text style={styles.formError}>{deleteNote.error?.message}</Text> : null}
          <View style={styles.deleteActions}>
            <Button label="Cancelar" variant="secondary" onPress={() => setDeleteTarget(null)} style={styles.deleteButton} />
            <Button label="Apagar" variant="danger" loading={deleteNote.isPending} onPress={confirmDelete} style={styles.deleteButton} />
          </View>
        </View>
      </Sheet>

      {galleryIndex !== null ? <ImageGalleryModal
        visible={galleryIndex !== null}
        title="anotações"
        images={noteImages}
        activeIndex={galleryIndex ?? 0}
        onActiveIndexChange={setGalleryIndex}
        onClose={() => setGalleryIndex(null)}
      /> : null}
    </View>
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// Parity with the sync summary in src/components/notes-chat.tsx: synced / pending / conflicts /
// error, plus a manual "Sincronizar novamente".
function SyncStatusBar({ summary, cachedAt, syncing, onRetry }: {
  summary: NotesSyncSummary;
  cachedAt?: string;
  syncing: boolean;
  onRetry(): void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const tone = summary.state === 'conflict' || summary.state === 'pending' || summary.state === 'offline'
    ? colors.amber300
    : summary.state === 'error' ? colors.red300 : colors.emerald400;
  const icon = summary.state === 'synced' ? 'cloud-done-outline'
    : summary.state === 'syncing' ? 'sync-outline'
      : summary.state === 'offline' ? 'cloud-offline-outline'
        : summary.state === 'conflict' ? 'git-compare-outline'
          : summary.state === 'error' ? 'alert-circle-outline' : 'cloud-upload-outline';
  const headline = summary.state === 'synced' ? 'Tudo sincronizado'
    : summary.state === 'syncing' ? 'Sincronizando…'
      : summary.state === 'offline' ? 'Sem conexão com o servidor'
        : summary.state === 'conflict' ? plural(summary.conflicts, 'conflito', 'conflitos')
          : summary.state === 'error' ? 'Falha ao sincronizar' : 'Envio pendente';
  return (
    <View style={styles.statusBar} accessibilityRole="summary" testID="notes-sync-status" accessibilityLabel={`Sincronização: ${headline}`}>
      <View style={styles.statusHeadline}>
        <Ionicons name={icon} size={14} color={tone} />
        <Text style={[styles.statusHeadlineText, { color: tone }]}>{headline}</Text>
      </View>
      <View style={styles.statusDetails}>
        <Text style={styles.statusMeta}>{plural(summary.synced, 'sincronizada', 'sincronizadas')}</Text>
        {summary.pending > 0 ? <Text style={[styles.statusMeta, styles.statusWarn]}>{plural(summary.pending, 'pendente', 'pendentes')}</Text> : null}
        {summary.conflicts > 0 ? <Text style={[styles.statusMeta, styles.statusWarn]}>{plural(summary.conflicts, 'conflito', 'conflitos')}</Text> : null}
        {summary.failed > 0 ? <Text style={[styles.statusMeta, styles.statusError]}>{plural(summary.failed, 'falha no envio', 'falhas no envio')}</Text> : null}
        {cachedAt ? <Text style={styles.statusMeta}>cópia de {formatShortDate(cachedAt)} · {formatTime(cachedAt)}</Text> : null}
        {summary.canRetry ? (
          <Pressable
            onPress={onRetry}
            disabled={syncing}
            accessibilityRole="button"
            accessibilityLabel="Sincronizar novamente"
            accessibilityState={{ disabled: syncing }}
            style={[styles.statusRetry, syncing && styles.statusRetryDisabled]}
            testID="notes-sync-retry"
          >
            <Text style={styles.statusRetryLabel}>{syncing ? 'Sincronizando…' : 'Sincronizar novamente'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ConflictVersion({ label, note, emptyLabel }: { label: string; note: LocalNote | null; emptyLabel: string }) {
  const styles = useStyles();
  return (
    <View style={styles.conflictVersion}>
      <Text style={styles.conflictVersionLabel}>{label}</Text>
      {note ? (
        <>
          {note.imageDataUrl ? (
            <Image
              source={{ uri: note.imageDataUrl }}
              style={styles.conflictImage}
              contentFit="cover"
              accessibilityLabel={`Imagem da ${label.toLowerCase()}`}
            />
          ) : null}
          <Text style={styles.conflictBody} numberOfLines={8}>{note.body || '(sem texto)'}</Text>
          <Text style={styles.conflictTime}>{formatDate(note.updatedAt)} · {formatTime(note.updatedAt)}</Text>
        </>
      ) : (
        <Text style={styles.conflictBodyMuted}>{emptyLabel}</Text>
      )}
    </View>
  );
}

// Parity with src/components/notes-chat.tsx: both versions side by side (text, image, time),
// with use-local/use-remote for changed notes and restore/accept-deletion for deleted ones.
function ConflictCard({ conflict, disabled, onUseLocal, onUseRemote, onEditRemote, onAcceptDeletion, onKeepAsNew }: {
  conflict: NoteConflict;
  disabled: boolean;
  onUseLocal(): void;
  onUseRemote(): void;
  onEditRemote?: () => void;
  onAcceptDeletion(): void;
  onKeepAsNew(): void;
}) {
  const styles = useStyles();
  const changed = conflict.kind === 'changed';
  return (
    <View style={styles.conflictCard} testID={`note-conflict-${conflict.local.id}`}>
      <Text style={styles.conflictTitle}>
        {changed ? 'Esta anotação mudou em outro aparelho.' : 'Esta anotação foi removida em outro aparelho.'}
      </Text>
      <View style={styles.conflictColumns}>
        <ConflictVersion label="Sua versão" note={conflict.local} emptyLabel="(sem texto)" />
        <ConflictVersion label="Versão do servidor" note={changed ? conflict.remote : null} emptyLabel="Removida no servidor." />
      </View>
      <View style={styles.conflictActions}>
        {changed ? (
          <>
            <Button label="Usar minha versão" onPress={onUseLocal} disabled={disabled} accessibilityLabel="Usar minha versão e sobrescrever a do servidor" />
            <Button label="Usar versão do servidor" variant="secondary" onPress={onUseRemote} disabled={disabled} accessibilityLabel="Usar versão do servidor e descartar a minha" />
            {onEditRemote ? <Button label="Editar versão do servidor" variant="secondary" onPress={onEditRemote} disabled={disabled} /> : null}
          </>
        ) : (
          <>
            <Button label="Restaurar minha versão" onPress={onUseLocal} disabled={disabled} />
            <Button label="Aceitar exclusão" variant="danger" onPress={onAcceptDeletion} disabled={disabled} accessibilityLabel="Aceitar exclusão e descartar minha versão" />
          </>
        )}
        <Button label="Manter como nova anotação" variant="ghost" onPress={onKeepAsNew} disabled={disabled} />
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  container: { gap: spacing.md },
  syncNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSofter,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.sm,
  },
  syncNoticeText: { flex: 1, ...typography.small, color: colors.zinc500, lineHeight: 16 },
  list: { maxHeight: LIST_MAX_HEIGHT },
  listContent: { gap: spacing.sm },
  dateSeparator: { alignItems: 'center', marginVertical: spacing.sm },
  dateSeparatorText: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '700',
    color: colors.zinc500,
  },
  bubbleRow: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '85%',
    minWidth: 96,
    borderRadius: radii.xl,
    borderBottomRightRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(124,58,237,0.18)',
    overflow: 'hidden',
  },
  bubblePending: { opacity: 0.6 },
  bubbleImage: { width: '100%', aspectRatio: 16 / 9 },
  bubbleText: { ...typography.body, color: colors.foreground, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  bubbleTextWithMenu: { paddingRight: spacing.xl + spacing.sm },
  bubbleMenu: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
    width: 26,
    height: 26,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.35)',
  },
  statusBar: {
    gap: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.sm,
  },
  statusHeadline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusHeadlineText: { fontSize: 12, fontWeight: '800' },
  statusDetails: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  statusMeta: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  statusWarn: { color: colors.amber300 },
  statusError: { color: colors.red300 },
  statusRetry: { borderRadius: radii.full, backgroundColor: colors.surfaceSoft, paddingHorizontal: spacing.sm, paddingVertical: 5, minHeight: 28, justifyContent: 'center' },
  statusRetryDisabled: { opacity: 0.5 },
  statusRetryLabel: { fontSize: 11, fontWeight: '800', color: colors.zinc300 },
  conflictPanel: {
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    backgroundColor: 'rgba(245,158,11,0.06)',
    padding: spacing.md,
  },
  conflictHeading: { fontSize: 12, fontWeight: '800', color: colors.amber300 },
  conflictCard: { gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)', backgroundColor: colors.surfaceDeep, padding: spacing.sm },
  conflictTitle: { ...typography.small, color: colors.zinc300, fontWeight: '700' },
  conflictColumns: { flexDirection: 'row', gap: spacing.sm },
  conflictVersion: { flex: 1, gap: 4, borderRadius: radii.md, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.sm },
  conflictVersionLabel: { fontSize: 10, fontWeight: '800', color: colors.zinc500, textTransform: 'uppercase' },
  conflictImage: { width: '100%', height: 80, borderRadius: radii.md, backgroundColor: colors.zinc900 },
  conflictBody: { fontSize: 12, lineHeight: 16, color: colors.zinc300 },
  conflictBodyMuted: { fontSize: 12, color: colors.zinc500 },
  conflictTime: { fontSize: 10, color: colors.zinc600 },
  conflictActions: { gap: spacing.xs },
  bubbleFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  bubbleMeta: { fontSize: 9, color: 'rgba(196,181,253,0.6)', fontWeight: '700' },
  composerCard: {
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    backgroundColor: 'rgba(139,92,246,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  editingBannerText: { fontSize: 11, fontWeight: '700', color: colors.violet300 },
  formError: { ...typography.small, color: colors.red300 },
  previewRow: { alignSelf: 'flex-start' },
  previewImage: { width: 96, height: 72, borderRadius: radii.lg, backgroundColor: colors.zinc900 },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radii.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  imageButton: { width: 40, height: 40, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceDeep },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.foreground,
  },
  sendButton: { width: 40, height: 40, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet600 },
  sendButtonDisabled: { backgroundColor: colors.zinc800 },
  actionsBody: { padding: spacing.lg, gap: spacing.sm },
  deleteText: { ...typography.body, color: colors.zinc400 },
  deleteActions: { flexDirection: 'row', gap: spacing.sm },
  deleteButton: { flex: 1 },
}));
