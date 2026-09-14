import { useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useAppInternal } from '@/state/app-provider';
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useSetCommentReaction,
  useUpdateComment,
} from '@/state/discussion-queries';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { formatDateTime, type ClubComment } from '@clube-do-jogo/domain';
import { ReactionPickerSheet, ReactionsListSheet } from './ReactionSheets';

const REACTION_LIMIT = 10;

type DeleteTarget = { comment: ClubComment; rootId: string };
type ReactionPickerTarget = { comment: ClubComment; rootId: string };

type TimelineProps = { gameId: string; clubMonth?: string };

export function Timeline(props: TimelineProps) {
  const { sessionEpoch, selectedMonth } = useAppInternal();
  return <Discussion key={`${sessionEpoch}:${props.gameId}:${props.clubMonth || selectedMonth}`} {...props} />;
}

function Discussion({ gameId, clubMonth }: TimelineProps) {
  const colors = useThemeColors();
  const styles = useStyles();
  const router = useRouter();
  const { userId, profile, isHistorical } = useAppInternal();
  const commentsQuery = useComments(gameId, clubMonth);
  const createComment = useCreateComment();
  const updateComment = useUpdateComment();
  const deleteComment = useDeleteComment();
  const setReaction = useSetCommentReaction();

  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [editTarget, setEditTarget] = useState<ClubComment | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [reactionPickerTarget, setReactionPickerTarget] = useState<ReactionPickerTarget | null>(null);
  const [reactionsListTarget, setReactionsListTarget] = useState<ClubComment | null>(null);
  const [reactionNotice, setReactionNotice] = useState('');

  const comments = commentsQuery.data ?? [];

  function post(parentId: string | null) {
    const text = (parentId ? replyBody : body).trim();
    if (!text || isHistorical) return;
    createComment.mutate({ gameId, clubMonth, parentId, body: text }, {
      onSuccess: () => {
        Keyboard.dismiss();
        if (parentId) {
          setReplyBody('');
          setReplyingTo(null);
        } else {
          setBody('');
        }
      },
    });
  }

  function openEdit(comment: ClubComment) {
    setEditTarget(comment);
    setEditBody(comment.body);
  }

  function saveEdit() {
    if (!editTarget) return;
    const text = editBody.trim();
    if (!text) return;
    updateComment.mutate({
      gameId,
      clubMonth,
      commentId: editTarget.id,
      body: text,
      expectedUpdatedAt: editTarget.updated_at,
    }, { onSuccess: () => setEditTarget(null) });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteComment.mutate({
      gameId,
      clubMonth,
      commentId: deleteTarget.comment.id,
      expectedUpdatedAt: deleteTarget.comment.updated_at,
    }, { onSuccess: () => setDeleteTarget(null) });
  }

  function pickReaction(emoji: string) {
    if (!reactionPickerTarget) return;
    const { comment } = reactionPickerTarget;
    const existing = comment.reactions.find(reaction => reaction.emoji === emoji);
    if (!existing && comment.reactions.length >= REACTION_LIMIT) {
      setReactionNotice('Limite de 10 emojis diferentes atingido neste comentário.');
      return;
    }
    setReactionPickerTarget(null);
    setReaction.mutate({ gameId, clubMonth, commentId: comment.id, emoji, enabled: !existing?.reactedByMe });
  }

  function openReactionPicker(target: ReactionPickerTarget) {
    setReactionNotice('');
    setReactionPickerTarget(target);
  }

  function toggleReaction(comment: ClubComment, emoji: string) {
    if (isHistorical) return;
    const existing = comment.reactions.find(reaction => reaction.emoji === emoji);
    setReaction.mutate({ gameId, clubMonth, commentId: comment.id, emoji, enabled: !existing?.reactedByMe });
  }

  function openProfile(id: string) {
    router.push({ pathname: '/(app)/perfil/[id]', params: { id } });
  }

  if (commentsQuery.isLoading) return <LoadingState label="Carregando conversa…" />;
  if (commentsQuery.isError) {
    return <ErrorState message={commentsQuery.error.message} onRetry={() => commentsQuery.refetch()} />;
  }

  return (
    <View style={styles.container}>
      {!isHistorical ? (
        <View style={styles.composerCard}>
          <View style={styles.composerRow}>
            <Avatar uri={profile?.avatar_url} crop={profile?.avatar_crop} name={profile?.name} size={36} />
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="O que você está achando do jogo?"
              placeholderTextColor={colors.zinc600}
              multiline
              style={styles.composerInput}
              testID="timeline-composer-input"
              accessibilityLabel="Escrever comentário"
            />
          </View>
          <View style={styles.composerActions}>
            <Button
              label="Comentar"
              onPress={() => post(null)}
              disabled={!body.trim() || createComment.isPending}
              loading={createComment.isPending}
              icon={<Ionicons name="send" size={14} color={colors.white} />}
              style={styles.composerButton}
            />
          </View>
          {createComment.isError ? <Text style={styles.formError}>{createComment.error?.message}</Text> : null}
        </View>
      ) : null}

      {comments.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="A conversa ainda não começou"
          description="Compartilhe a primeira impressão sobre o jogo."
        />
      ) : (
        <View style={styles.list}>
          {comments.map(comment => (
            <View key={comment.id} style={styles.thread}>
              <CommentCard
                comment={comment}
                nested={false}
                userId={userId}
                isHistorical={isHistorical}
                editing={editTarget?.id === comment.id}
                editBody={editBody}
                savingEdit={updateComment.isPending}
                onEditBodyChange={setEditBody}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditTarget(null)}
                onOpenProfile={openProfile}
                onReply={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                onEdit={() => openEdit(comment)}
                onDelete={() => setDeleteTarget({ comment, rootId: comment.id })}
                onOpenReactionPicker={() => openReactionPicker({ comment, rootId: comment.id })}
                onOpenReactionsList={() => setReactionsListTarget(comment)}
                onToggleReaction={emoji => toggleReaction(comment, emoji)}
              />
              {comment.replies.length > 0 || replyingTo === comment.id ? (
                <View style={styles.replies}>
                  {comment.replies.map(reply => (
                    <CommentCard
                      key={reply.id}
                      comment={reply}
                      nested
                      userId={userId}
                      isHistorical={isHistorical}
                      editing={editTarget?.id === reply.id}
                      editBody={editBody}
                      savingEdit={updateComment.isPending}
                      onEditBodyChange={setEditBody}
                      onSaveEdit={saveEdit}
                      onCancelEdit={() => setEditTarget(null)}
                      onOpenProfile={openProfile}
                      onEdit={() => openEdit(reply)}
                      onDelete={() => setDeleteTarget({ comment: reply, rootId: comment.id })}
                      onOpenReactionPicker={() => openReactionPicker({ comment: reply, rootId: comment.id })}
                      onOpenReactionsList={() => setReactionsListTarget(reply)}
                      onToggleReaction={emoji => toggleReaction(reply, emoji)}
                    />
                  ))}
                  {replyingTo === comment.id ? (
                    <View style={styles.replyComposer}>
                      <TextInput
                        value={replyBody}
                        onChangeText={setReplyBody}
                        placeholder={`Responder a ${comment.profile?.name || 'membro'}…`}
                        placeholderTextColor={colors.zinc600}
                        style={styles.replyInput}
                        testID={`timeline-reply-input-${comment.id}`}
                        accessibilityLabel="Escrever resposta"
                      />
                      <Pressable
                        onPress={() => post(comment.id)}
                        disabled={!replyBody.trim() || createComment.isPending}
                        accessibilityRole="button"
                        accessibilityLabel="Enviar resposta"
                        style={[styles.replySend, (!replyBody.trim() || createComment.isPending) && styles.replySendDisabled]}
                      >
                        <Ionicons name="send" size={14} color={colors.white} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <ReactionPickerSheet
        visible={Boolean(reactionPickerTarget)}
        notice={reactionNotice}
        onClose={() => setReactionPickerTarget(null)}
        onSelect={pickReaction}
      />
      <ReactionsListSheet
        visible={Boolean(reactionsListTarget)}
        comment={reactionsListTarget}
        onClose={() => setReactionsListTarget(null)}
      />
      <Sheet visible={Boolean(deleteTarget)} title="Apagar comentário?" onClose={() => setDeleteTarget(null)}>
        <View style={styles.deleteBody}>
          <Text style={styles.deleteText}>
            {deleteTarget && !deleteTarget.comment.parent_id && deleteTarget.comment.replies.length > 0
              ? 'As respostas também serão apagadas.'
              : 'Esta ação não pode ser desfeita.'}
          </Text>
          {deleteComment.isError ? <Text style={styles.formError}>{deleteComment.error?.message}</Text> : null}
          <View style={styles.deleteActions}>
            <Button label="Cancelar" variant="secondary" onPress={() => setDeleteTarget(null)} style={styles.deleteButton} />
            <Button
              label="Apagar"
              variant="danger"
              loading={deleteComment.isPending}
              onPress={confirmDelete}
              style={styles.deleteButton}
            />
          </View>
        </View>
      </Sheet>
    </View>
  );
}

function CommentCard({
  comment,
  nested,
  userId,
  isHistorical,
  editing,
  editBody,
  savingEdit,
  onEditBodyChange,
  onSaveEdit,
  onCancelEdit,
  onOpenProfile,
  onReply,
  onEdit,
  onDelete,
  onOpenReactionPicker,
  onOpenReactionsList,
  onToggleReaction,
}: {
  comment: ClubComment;
  nested: boolean;
  userId: string | null;
  isHistorical: boolean;
  editing: boolean;
  editBody: string;
  savingEdit: boolean;
  onEditBodyChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onOpenProfile: (id: string) => void;
  onReply?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenReactionPicker: () => void;
  onOpenReactionsList: () => void;
  onToggleReaction: (emoji: string) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const isMine = Boolean(userId) && comment.user_id === userId;
  const authorName = comment.profile?.name || 'Membro';
  return (
    <View style={[styles.card, nested && styles.cardNested]}>
      <Pressable
        onPress={() => onOpenProfile(comment.user_id)}
        accessibilityRole="button"
        accessibilityLabel={`Ver perfil de ${authorName}`}
      >
        <Avatar uri={comment.profile?.avatar_url} crop={comment.profile?.avatar_crop} name={comment.profile?.name} size={nested ? 30 : 34} />
      </Pressable>
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Pressable
            onPress={() => onOpenProfile(comment.user_id)}
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${authorName}`}
            style={styles.authorButton}
          >
            <Text style={styles.authorName} numberOfLines={1}>{authorName}</Text>
          </Pressable>
          <Text style={styles.timestamp}>{formatDateTime(comment.created_at)}</Text>
        </View>

        {editing ? (
          <View style={styles.editForm}>
            <TextInput
              value={editBody}
              onChangeText={onEditBodyChange}
              multiline
              style={styles.editInput}
              testID={`timeline-edit-input-${comment.id}`}
              accessibilityLabel="Editar comentário"
            />
            <View style={styles.editActions}>
              <Button label="Cancelar" variant="secondary" onPress={onCancelEdit} style={styles.editButton} />
              <Button label="Salvar" onPress={onSaveEdit} loading={savingEdit} disabled={!editBody.trim()} style={styles.editButton} />
            </View>
          </View>
        ) : (
          <Text testID={`comment-body-${comment.id}`} style={styles.body}>{comment.body}</Text>
        )}

        <View style={styles.actionsRow}>
          {comment.reactions.map(reaction => (
            <Pressable
              key={reaction.emoji}
              onPress={() => onToggleReaction(reaction.emoji)}
              onLongPress={onOpenReactionsList}
              accessibilityRole="button"
              accessibilityLabel={`Reação ${reaction.emoji}, ${reaction.users.length} pessoa(s)`}
              style={[styles.reactionPill, reaction.reactedByMe && styles.reactionPillActive]}
            >
              <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
              <Text style={[styles.reactionCount, reaction.reactedByMe && styles.reactionCountActive]}>{reaction.users.length}</Text>
            </Pressable>
          ))}
          {!isHistorical ? (
            <Pressable onPress={onOpenReactionPicker} accessibilityRole="button" accessibilityLabel="Adicionar reação" style={styles.iconButton}>
              <Ionicons name="happy-outline" size={16} color={colors.zinc400} />
            </Pressable>
          ) : null}
          {!nested && !isHistorical && onReply ? (
            <Pressable onPress={onReply} accessibilityRole="button" accessibilityLabel="Responder" style={styles.replyButton}>
              <Ionicons name="return-down-forward-outline" size={13} color={colors.zinc500} />
              <Text style={styles.replyButtonLabel}>Responder</Text>
            </Pressable>
          ) : null}
          {!isHistorical && isMine ? (
            <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Editar comentário" style={styles.iconButton}>
              <Ionicons name="pencil-outline" size={15} color={colors.zinc400} />
            </Pressable>
          ) : null}
          {!isHistorical && isMine ? (
            <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="Apagar comentário" style={styles.iconButtonDanger}>
              <Ionicons name="trash-outline" size={15} color={colors.red400} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  container: { gap: spacing.md },
  composerCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
    gap: spacing.sm,
  },
  composerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  composerInput: { flex: 1, minHeight: 44, ...typography.body, color: colors.foreground, paddingTop: 6 },
  composerActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  composerButton: { height: 38, paddingHorizontal: spacing.md },
  formError: { ...typography.small, color: colors.red300 },
  list: { gap: spacing.lg },
  thread: { gap: spacing.sm },
  replies: { marginLeft: spacing.xl, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.md,
  },
  cardNested: { backgroundColor: colors.surfaceSoft, padding: spacing.sm },
  cardBody: { flex: 1, gap: spacing.xs },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  authorButton: { flexShrink: 1 },
  authorName: { ...typography.small, color: colors.foreground, fontWeight: '800' },
  timestamp: { fontSize: 10, fontWeight: '700', color: colors.zinc500 },
  body: { ...typography.body, color: colors.zinc300, lineHeight: 19 },
  editForm: { gap: spacing.sm },
  editInput: {
    minHeight: 60,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    padding: spacing.sm,
    ...typography.body,
    color: colors.foreground,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  editButton: { flex: 1, height: 38 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
  },
  reactionPillActive: { borderColor: 'rgba(139,92,246,0.4)', backgroundColor: 'rgba(139,92,246,0.15)' },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 10, fontWeight: '800', color: colors.zinc400 },
  reactionCountActive: { color: colors.violet300 },
  iconButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full },
  iconButtonDanger: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full, marginLeft: 'auto' },
  replyButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: spacing.xs },
  replyButtonLabel: { fontSize: 10, fontWeight: '800', color: colors.zinc500 },
  replyComposer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  replyInput: {
    flex: 1,
    height: 40,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    ...typography.small,
    color: colors.foreground,
  },
  replySend: { width: 40, height: 40, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violet600 },
  replySendDisabled: { backgroundColor: colors.zinc800 },
  deleteBody: { padding: spacing.lg, gap: spacing.md },
  deleteText: { ...typography.body, color: colors.zinc400 },
  deleteActions: { flexDirection: 'row', gap: spacing.sm },
  deleteButton: { flex: 1 },
}));
