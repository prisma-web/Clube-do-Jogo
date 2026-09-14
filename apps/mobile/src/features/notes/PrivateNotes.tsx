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
import { createNativeNoteId, mergePendingIntoList, useDeleteNote, useNoteDraft, useNotes, useNotesPendingQueue } from '@/state/discussion-queries';
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
  const { isDemo, isHistorical, userId } = useAppInternal();
  const readOnly = Boolean(snapshotMonth) || isHistorical;

  const notesQuery = useNotes(gameId, { snapshotMonth });
  const deleteNote = useDeleteNote();
  const draftState = useNoteDraft(gameId);
  const pendingQueue = useNotesPendingQueue(gameId);

  const [imageError, setImageError] = useState('');
  const [picking, setPicking] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<LocalNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalNote | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const listRef = useRef<ScrollView>(null);

  const notes = mergePendingIntoList(notesQuery.data ?? [], pendingQueue.queue);
  const pendingIds = pendingQueue.queue;

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

  if (notesQuery.isLoading) return <LoadingState label="Carregando anotações…" />;
  if (notesQuery.isError) {
    return <ErrorState message={notesQuery.error.message} onRetry={() => notesQuery.refetch()} />;
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
                    {note.body ? <Text style={styles.bubbleText}>{note.body}</Text> : null}
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
          {conflictEntries.map(([noteId, conflict]) => (
            <View key={noteId} style={styles.actionsBody}>
              <Text style={styles.formError}>
                {conflict.kind === 'changed' ? 'Esta anotação mudou no servidor.' : 'Esta anotação foi removida no servidor.'}
              </Text>
              {conflict.kind === 'changed' ? (
                <>
                  <Text style={styles.bubbleText}>Versão do servidor: {conflict.remote.body}</Text>
                  <Button label="Editar versão do servidor" variant="secondary" onPress={() => { pendingQueue.resolveUseRemote(noteId); beginEdit(conflict.remote); }} />
                </>
              ) : null}
              <Button label="Manter como nova anotação" variant="secondary" onPress={() => pendingQueue.resolveKeepAsNew(noteId)} />
            </View>
          ))}
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
        key={`note-gallery-${galleryIndex}`}
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
