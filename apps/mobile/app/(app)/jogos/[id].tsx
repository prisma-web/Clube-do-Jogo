import { PrivateNotes } from '@/features/notes/PrivateNotes';
import { useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { StatusPill, useStatusMeta } from '@/components/StatusPill';
import { PreferenceButtons } from '@/components/PreferenceButtons';
import { VoteReasonSheet, voteReasonLabel } from '@/components/VoteReasonSheet';
import { RatingSheet } from '@/components/RatingSheet';
import { RatingValue } from '@/components/RatingValue';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { useApp } from '@/state/app-provider';
import { useBacklog, useFavorite, useGame, useLibrary, useProgress, useRanking, useSetProgress, useVote } from '@/state/queries';
import { useSetRating } from '@/state/library-queries';
import { useGameMedia, useGameMugshots, useUpdateProfile } from '@/state/profile-queries';
import { ScreenshotsCarousel } from '@/features/media/ScreenshotsCarousel';
import { ImageGalleryModal } from '@/features/media/ImageGalleryModal';
import { MugshotsGrid } from '@/features/media/MugshotsGrid';
import { TrailerModal } from '@/features/media/TrailerModal';
import { AvatarCropEditor, DEFAULT_AVATAR_SELECTION_CROP } from '@/features/profile/AvatarCropEditor';
import { useClubGameAdminAction } from '@/features/admin';
import { VoteParticipantsSheet } from '@/components/VoteParticipantsSheet';
import { getCanonicalGameUrl } from '@/features/media/canonical-url';
import { getRankingFormula } from '@/platform/config';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { gameCoverUrl, type AvatarCrop, type GameMugshot, type ProgressStatus, type RatingDetails, type RatingMode, type VoteChoice, type VoteReason } from '@clube-do-jogo/domain';

const rankingFormula = getRankingFormula();
const DESCRIPTION_EXPAND_THRESHOLD = 180;

const statusOrder: ProgressStatus[] = ['not_started', 'started', 'finished'];

export default function GameDetailScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = String(id);
  const statusMeta = useStatusMeta();
  const { userId, isAdmin, isHistorical, isDemo } = useApp();
  const clubGameAdmin = useClubGameAdminAction();

  const gameQuery = useGame(gameId);
  const mediaQuery = useGameMedia(gameId);
  const libraryQuery = useLibrary();
  const rankingQuery = useRanking();
  const progressQuery = useProgress(gameId);
  const mugshotsQuery = useGameMugshots(gameId);

  const backlog = useBacklog();
  const favorite = useFavorite();
  const vote = useVote();
  const setProgress = useSetProgress();
  const setRating = useSetRating();
  const updateProfile = useUpdateProfile();

  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonToken, setReasonToken] = useState(0);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingToken, setRatingToken] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [avatarSource, setAvatarSource] = useState<{ url: string; name: string } | null>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [participantsChoice, setParticipantsChoice] = useState<VoteChoice | null>(null);

  const game = mediaQuery.data ?? gameQuery.data ?? null;
  const libraryEntry = useMemo(
    () => (libraryQuery.data?.library ?? []).find(item => item.game.id === gameId) ?? null,
    [libraryQuery.data, gameId],
  );
  const rankingEntry = useMemo(
    () => (rankingQuery.data ?? []).find(item => item.game.id === gameId) ?? null,
    [rankingQuery.data, gameId],
  );
  const progress = progressQuery.data ?? [];
  const mine = progress.find(item => item.user_id === userId) ?? null;
  const ratedProgress = progress.filter(item => item.rating !== null);
  const clubAverage = ratedProgress.length
    ? ratedProgress.reduce((total, item) => total + Number(item.rating), 0) / ratedProgress.length
    : null;

  const inBacklog = libraryEntry?.inBacklog ?? false;
  const isFavorite = libraryEntry?.favorite ?? false;
  const myChoice = rankingEntry?.myChoice ?? null;
  const totalPoints = rankingEntry?.totalPoints ?? 0;
  const ownedPlatformIds = useMemo(
    () => new Set((libraryQuery.data?.platforms ?? []).map(platform => platform.igdb_platform_id)),
    [libraryQuery.data],
  );
  const orderedPlatforms = useMemo(() => (game?.platforms ?? [])
    .map((name, index) => ({ name, platformId: game?.platform_ids?.[index] ?? -1, index }))
    .sort((first, second) =>
      Number(ownedPlatformIds.has(second.platformId)) - Number(ownedPlatformIds.has(first.platformId))
      || first.index - second.index,
    ), [game?.platforms, game?.platform_ids, ownedPlatformIds]);

  function choose(choice: VoteChoice) {
    if (isHistorical) return;
    if (choice === 'would_not_play') {
      if (myChoice === 'would_not_play') {
        vote.mutate({ gameId, choice: null });
        return;
      }
      setReasonToken(token => token + 1);
      setReasonOpen(true);
      return;
    }
    vote.mutate({ gameId, choice: myChoice === choice ? null : choice });
  }

  function confirmReason(reason: VoteReason, reasonText: string | null) {
    setReasonOpen(false);
    vote.mutate({ gameId, choice: 'would_not_play', reason, reasonText: reasonText ?? undefined });
  }

  function updateStatus(status: ProgressStatus) {
    if (isHistorical || mine?.status === status) return;
    setProgress.mutate({ gameId, status });
  }

  function openRating() {
    setRatingToken(token => token + 1);
    setRatingOpen(true);
  }

  function saveRating(input: { rating: number; ratingMode: RatingMode; ratingDetails: RatingDetails | null }) {
    setRating.mutate({ gameId, ...input }, { onSuccess: () => setRatingOpen(false) });
  }

  function removeRating() {
    setRating.mutate({ gameId, rating: null, ratingMode: 'simple', ratingDetails: null }, { onSuccess: () => setRatingOpen(false) });
  }

  if (gameQuery.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState label="Carregando jogo…" />
      </Screen>
    );
  }

  if (gameQuery.isError) {
    return (
      <Screen edges={[]}>
        <ErrorState message={gameQuery.error.message} onRetry={() => gameQuery.refetch()} />
      </Screen>
    );
  }

  if (!game) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="alert-circle-outline" title="Jogo não encontrado" description="Esse jogo pode ter sido removido." />
      </Screen>
    );
  }

  const mutationError = backlog.error || favorite.error || vote.error || setProgress.error;
  const hasCover = Boolean(game.image_url);
  const galleryImages = [game.image_url, ...(game.screenshot_urls ?? [])].filter((url): url is string => Boolean(url));
  const mugshots = mugshotsQuery.data ?? [];
  const allGalleryImages = [...galleryImages, ...mugshots.map(mugshot => mugshot.image_url)];

  async function shareGame() {
    const url = getCanonicalGameUrl(gameId);
    if (!url) return;
    try {
      await Share.share({ message: `${game!.title} — ${url}`, url });
    } catch {
      // usuário cancelou o compartilhamento
    }
  }

  function chooseAvatarFromScreenshot(url: string) {
    setAvatarSource({ url, name: game!.title });
  }

  function chooseAvatarFromMugshot(mugshot: GameMugshot) {
    setAvatarSource({ url: mugshot.image_url, name: mugshot.name });
  }

  function saveAvatarCrop(crop: AvatarCrop) {
    if (!avatarSource) return;
    updateProfile.mutate(
      { avatar_url: avatarSource.url, avatar_crop: crop },
      { onSuccess: () => setAvatarSource(null) },
    );
  }

  return (
    <Screen edges={[]} onRefresh={() => gameQuery.refetch()} refreshing={gameQuery.isRefetching}>
      <AppHeader
        title={game.title}
        right={
          <Pressable onPress={shareGame} accessibilityRole="button" accessibilityLabel="Compartilhar jogo" hitSlop={8}>
            <Ionicons name="share-outline" size={20} color={colors.zinc300} />
          </Pressable>
        }
      />

      <Pressable onPress={hasCover ? () => setGalleryIndex(0) : undefined} disabled={!hasCover} accessibilityRole={hasCover ? 'button' : 'image'} accessibilityLabel={hasCover ? `Ampliar capa de ${game.title}` : `Capa de ${game.title}`}>
        <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.cover} contentFit="cover" accessibilityLabel={`Capa de ${game.title}`} />
      </Pressable>

      {game.trailer_url ? (
        <Pressable onPress={() => setTrailerOpen(true)} accessibilityRole="button" accessibilityLabel={`Assistir trailer de ${game.title}`} style={styles.trailerButton}>
          <Ionicons name="play-circle" size={18} color={colors.violet300} />
          <Text style={styles.trailerButtonLabel}>Assistir trailer</Text>
        </Pressable>
      ) : null}

      <View style={styles.metaRow}>
        <MetaChip icon="time-outline" label={`${game.duration_hours} h`} />
        {game.release_year ? <MetaChip icon="calendar-outline" label={String(game.release_year)} /> : null}
        {game.average_rating ? <MetaChip icon="star" label={game.average_rating.toFixed(1)} /> : null}
      </View>

      {game.genres?.length ? (
        <View style={styles.tagsRow}>
          {game.genres.map(genre => (
            <View key={genre} style={styles.tag}>
              <Text style={styles.tagText}>{genre}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {orderedPlatforms.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Plataformas</Text>
          <View style={styles.tagsRow}>
            {orderedPlatforms.map(platform => {
              const owned = ownedPlatformIds.has(platform.platformId);
              return (
                <View key={platform.name} style={[styles.platformChip, owned && styles.platformChipOwned]}>
                  {owned ? <Ionicons name="checkmark-circle" size={13} color={colors.emerald400} /> : null}
                  <Text style={[styles.tagText, owned && styles.platformChipOwnedText]}>{platform.name}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text style={styles.description} numberOfLines={descriptionExpanded ? undefined : 3}>{game.description}</Text>
      {game.description && game.description.length > DESCRIPTION_EXPAND_THRESHOLD ? (
        <Pressable onPress={() => setDescriptionExpanded(value => !value)} accessibilityRole="button" style={styles.descriptionToggle}>
          <Text style={styles.descriptionToggleLabel}>{descriptionExpanded ? 'Ver menos' : 'Ver mais'}</Text>
        </Pressable>
      ) : null}

      <View style={styles.actionsRow}>
        <Button
          label={inBacklog ? 'Remover de Meus Jogos' : 'Adicionar a Meus Jogos'}
          variant={inBacklog ? 'secondary' : 'primary'}
          icon={<Ionicons name={inBacklog ? 'checkmark' : 'add'} size={16} color={inBacklog ? colors.zinc300 : colors.white} />}
          loading={backlog.isPending}
          onPress={() => backlog.mutate({ gameId, inBacklog: !inBacklog })}
          style={styles.actionButton}
        />
        <Button
          label={isFavorite ? 'Favorito' : 'Favoritar'}
          variant="ghost"
          icon={<Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={16} color={colors.violet300} />}
          loading={favorite.isPending}
          onPress={() => favorite.mutate({ gameId, favorite: !isFavorite })}
          style={styles.actionButton}
        />
      </View>

      {isAdmin ? (
        <Button
          label="Gerenciar jogo do clube"
          variant="secondary"
          icon={<Ionicons name="ribbon-outline" size={16} color={colors.amber400} />}
          onPress={() => clubGameAdmin.openFor(game)}
          style={styles.adminButton}
          accessibilityLabel={`Gerenciar ${game.title} como jogo do clube`}
        />
      ) : null}

      {mediaQuery.error && (
        <ErrorState message={mediaQuery.error.message} onRetry={() => void mediaQuery.refetch()} />
      )}

      {game.screenshot_urls?.length ? (
        <View style={styles.gallery}>
          <ScreenshotsCarousel
            title={game.title}
            images={game.screenshot_urls}
            avatarUrl={undefined}
            updatingAvatarUrl={updateProfile.isPending ? avatarSource?.url : null}
            onOpen={index => setGalleryIndex((hasCover ? 1 : 0) + index)}
            onChooseAvatar={chooseAvatarFromScreenshot}
          />
        </View>
      ) : null}

      {!isDemo ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personagens</Text>
          {mugshotsQuery.error ? (
            <ErrorState message={mugshotsQuery.error.message} onRetry={() => void mugshotsQuery.refetch()} />
          ) : <MugshotsGrid
            mugshots={mugshots}
            isLoading={mugshotsQuery.isLoading}
            updatingAvatarUrl={updateProfile.isPending ? avatarSource?.url : null}
            title={game.title}
            onOpen={index => setGalleryIndex(galleryImages.length + index)}
            onChooseAvatar={chooseAvatarFromMugshot}
          />}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pontuação do clube</Text>
        <Text style={styles.scoreValue}>{totalPoints.toFixed(rankingFormula === 'legacy' ? 1 : 0)}<Text style={styles.scoreUnit}> pts</Text></Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sua preferência</Text>
        <View style={styles.countsRow}>
          <Pressable
            onPress={() => setParticipantsChoice('would_play')}
            accessibilityRole="button"
            accessibilityLabel="Ver quem escolheu Jogaria"
            style={styles.countChip}
          >
            <Ionicons name="thumbs-up" size={13} color={colors.emerald400} />
            <Text style={styles.countText}>{rankingEntry?.choiceCounts.would_play ?? 0}</Text>
          </Pressable>
          <Pressable
            onPress={() => setParticipantsChoice('would_not_play')}
            accessibilityRole="button"
            accessibilityLabel="Ver quem escolheu Não jogaria"
            style={styles.countChip}
          >
            <Ionicons name="thumbs-down" size={13} color={colors.red400} />
            <Text style={styles.countText}>{rankingEntry?.choiceCounts.would_not_play ?? 0}</Text>
          </Pressable>
        </View>
        {myChoice === 'would_not_play' && rankingEntry?.myReason ? (
          <Text style={styles.myReason}>Meu motivo: {voteReasonLabel(rankingEntry.myReason)}</Text>
        ) : null}
        <PreferenceButtons value={myChoice} disabled={isHistorical || vote.isPending} onChange={choose} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Meu progresso</Text>
          {mine ? <StatusPill status={mine.status} /> : null}
        </View>
        <View style={styles.statusRow}>
          {statusOrder.map(status => {
            const meta = statusMeta[status];
            const active = (mine?.status ?? 'not_started') === status;
            return (
              <Button
                key={status}
                label={meta.label}
                icon={<Ionicons name={meta.icon} size={16} color={active ? colors.white : colors.zinc400} />}
                variant={active ? 'primary' : 'secondary'}
                disabled={isHistorical || active}
                loading={setProgress.isPending}
                onPress={() => updateStatus(status)}
                style={styles.statusButton}
              />
            );
          })}
        </View>
        {mine?.status === 'finished' ? (
          <View style={styles.ratingRow}>
            <View style={styles.ratingInfo}>
              <Text style={styles.fieldLabel}>Minha nota</Text>
              {mine.rating !== null ? <RatingValue value={mine.rating} /> : <Text style={styles.emptyMembers}>Sem nota ainda</Text>}
            </View>
            <Button
              label={mine.rating !== null ? 'Editar nota' : 'Avaliar'}
              variant="secondary"
              disabled={isHistorical}
              onPress={openRating}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Progresso do clube</Text>
          {clubAverage !== null ? <RatingValue value={clubAverage} /> : null}
        </View>
        {progressQuery.isLoading ? (
          <LoadingState label="Carregando progresso do clube…" />
        ) : progressQuery.isError ? (
          <ErrorState message={progressQuery.error.message} onRetry={() => progressQuery.refetch()} />
        ) : progress.length ? (
          <View style={{ gap: spacing.sm }}>
            {progress.map(item => (
              <View key={item.user_id} style={styles.memberRow}>
                <Text style={styles.memberName} numberOfLines={1}>{item.profile?.name || 'Membro'}</Text>
                <View style={styles.memberMeta}>
                  {item.rating !== null ? <RatingValue value={item.rating} size={11} /> : null}
                  <StatusPill status={item.status} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyMembers}>Ninguém registrou progresso ainda.</Text>
        )}
      </View>

      {mutationError ? <Text style={styles.formError}>{mutationError.message}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Minhas anotações</Text>
        <PrivateNotes gameId={gameId} />
      </View>

      <VoteReasonSheet
        key={`vote-reason-${reasonToken}`}
        visible={reasonOpen}
        initialReason={rankingEntry?.myReason}
        initialText={rankingEntry?.myReasonText}
        onClose={() => setReasonOpen(false)}
        onConfirm={confirmReason}
      />

      {participantsChoice ? (
        <VoteParticipantsSheet
          visible={participantsChoice !== null}
          profiles={rankingEntry?.choiceProfiles ?? { would_play: [], would_not_play: [] }}
          initialChoice={participantsChoice}
          onClose={() => setParticipantsChoice(null)}
        />
      ) : null}

      <RatingSheet
        key={`rating-${ratingToken}`}
        visible={ratingOpen}
        initialRating={mine?.rating ?? null}
        initialMode={mine?.rating_mode ?? 'simple'}
        initialDetails={mine?.rating_details}
        disabled={isHistorical}
        loading={setRating.isPending}
        error={setRating.error?.message ?? null}
        onClose={() => setRatingOpen(false)}
        onSave={saveRating}
        onRemove={removeRating}
      />

      {galleryIndex !== null && <ImageGalleryModal
        key={`gallery-${galleryIndex}`}
        visible={galleryIndex !== null}
        title={game.title}
        images={allGalleryImages}
        activeIndex={galleryIndex ?? 0}
        onActiveIndexChange={setGalleryIndex}
        onClose={() => setGalleryIndex(null)}
      />}

      <TrailerModal
        visible={trailerOpen}
        url={game.trailer_url}
        title={game.title}
        onClose={() => setTrailerOpen(false)}
      />

      {avatarSource && <AvatarCropEditor
        key={avatarSource.url}
        visible={avatarSource !== null}
        imageUrl={avatarSource?.url ?? null}
        name={avatarSource?.name ?? ''}
        crop={DEFAULT_AVATAR_SELECTION_CROP}
        saving={updateProfile.isPending}
        onClose={() => setAvatarSource(null)}
        onSave={saveAvatarCrop}
      />}

      {clubGameAdmin.sheet}
    </Screen>
  );
}

function MetaChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={13} color={colors.zinc400} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.xl, backgroundColor: colors.zinc900, marginBottom: spacing.md },
  trailerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, alignSelf: 'flex-start', borderRadius: radii.full, backgroundColor: 'rgba(139,92,246,0.16)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: spacing.md },
  trailerButtonLabel: { fontSize: 12, fontWeight: '800', color: colors.violet300 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.surfaceDeep },
  metaText: { fontSize: 11, fontWeight: '700', color: colors.zinc400 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.full, backgroundColor: 'rgba(139,92,246,0.12)' },
  tagText: { fontSize: 10, fontWeight: '700', color: colors.violet300 },
  description: { ...typography.small, color: colors.zinc400, lineHeight: 20, marginBottom: spacing.xs },
  descriptionToggle: { alignSelf: 'flex-start', marginBottom: spacing.lg },
  descriptionToggleLabel: { fontSize: 11, fontWeight: '800', color: colors.violet300 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  actionButton: { flex: 1 },
  adminButton: { marginBottom: spacing.lg },
  gallery: { marginBottom: spacing.lg },
  screenshot: { width: 220, height: 124, borderRadius: radii.lg, backgroundColor: colors.zinc900 },
  card: { borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceSofter, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.lg },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography.h3, color: colors.foreground },
  scoreValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1, color: colors.emerald300 },
  scoreUnit: { fontSize: 14, fontWeight: '700', color: colors.zinc500 },
  platformChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.full, backgroundColor: 'rgba(139,92,246,0.12)' },
  platformChipOwned: { backgroundColor: 'rgba(52,211,153,0.14)' },
  platformChipOwnedText: { color: colors.emerald300 },
  countsRow: { flexDirection: 'row', gap: spacing.sm },
  countChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: radii.md, backgroundColor: colors.surfaceDeep },
  countText: { fontSize: 11, fontWeight: '800', color: colors.zinc300 },
  myReason: { fontSize: 11, color: colors.red300, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: spacing.sm },
  statusButton: { flex: 1 },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  ratingInfo: { gap: spacing.xs },
  fieldLabel: { ...typography.small, color: colors.zinc400, fontWeight: '800' },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.md, backgroundColor: colors.surfaceDeep, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  memberName: { ...typography.small, color: colors.zinc300, flex: 1, marginRight: spacing.sm },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emptyMembers: { ...typography.small, color: colors.zinc600 },
  formError: { color: colors.red300, fontSize: 11, fontWeight: '600', marginBottom: spacing.lg },
}));
