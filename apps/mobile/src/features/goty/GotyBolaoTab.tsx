import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  computeBolaoLeaderboard,
  computeBolaoProgress,
  isBolaoVotingOpen,
  type GotyBolaoProgress,
  type GotyCategory,
  type GotyFullState,
  type GotyLeaderboardEntry,
  type GotyNominee,
} from '@clube-do-jogo/domain';
import { Avatar } from '@/components/Avatar';
import { useSelectBolaoVote, useSetBolaoConfirmation } from '@/state/goty-queries';
import {
  BALLOT_FILTER_OPTIONS,
  ballotFilterCount,
  filterBallotCategories,
  formatDateTimePt,
  type BallotFilter,
  type BolaoView,
} from './goty-logic';
import { gotyColors, gotyShared } from './goty-theme';
import { GotyBolaoAdmin } from './GotyBolaoAdmin';
import { GotyPosterArt } from './GotyPosterArt';
import {
  errorMessage,
  GotyButton,
  GotyChip,
  GotyEmpty,
  GotyPill,
  GotySegmented,
  GotySheet,
  GotyStat,
  useGotyNotify,
} from './GotyUi';
import { TgaEmblem } from './TgaEmblem';

export interface GotyBolaoTabProps {
  state: GotyFullState;
  userId: string;
  isAdmin: boolean;
  view: BolaoView;
  onViewChange: (view: BolaoView) => void;
  reviewOpen: boolean;
  onReviewOpenChange: (open: boolean) => void;
  scrollToNode: (node: View | null) => void;
}

export function useBolaoSummary(state: GotyFullState, userId: string) {
  const myVotes = useMemo(() => state.bolaoVotes.filter(vote => vote.user_id === userId), [state.bolaoVotes, userId]);
  const myVotesByCategory = useMemo(() => new Map(myVotes.map(vote => [vote.category_id, vote.nominee_id])), [myVotes]);
  const mySubmission = useMemo(
    () => state.bolaoSubmissions.find(item => item.user_id === userId) ?? null,
    [state.bolaoSubmissions, userId],
  );
  const progress = useMemo(() => computeBolaoProgress(state.categories, myVotes), [state.categories, myVotes]);
  const votingOpen = useMemo(() => isBolaoVotingOpen(state.event), [state.event]);
  return {
    myVotesByCategory,
    mySubmission,
    isConfirmed: Boolean(mySubmission?.confirmed_at),
    progress,
    votingOpen,
  };
}

export function GotyBolaoTab({
  state,
  userId,
  isAdmin,
  view,
  onViewChange,
  reviewOpen,
  onReviewOpenChange,
  scrollToNode,
}: GotyBolaoTabProps) {
  const notify = useGotyNotify();
  const selectVote = useSelectBolaoVote();
  const setConfirmation = useSetBolaoConfirmation();
  const [filter, setFilter] = useState<BallotFilter>('all');
  const [search, setSearch] = useState('');
  const [inspectEntry, setInspectEntry] = useState<GotyLeaderboardEntry | null>(null);
  const categoryRefs = useRef(new Map<string, View | null>());

  const { myVotesByCategory, mySubmission, isConfirmed, progress, votingOpen } = useBolaoSummary(state, userId);
  const announcedCount = useMemo(
    () => state.categories.filter(category => Boolean(category.winner_nominee_id)).length,
    [state.categories],
  );
  const leaderboard = useMemo(
    () => computeBolaoLeaderboard(state.categories, state.bolaoVotes, state.bolaoSubmissions, state.profiles),
    [state.categories, state.bolaoVotes, state.bolaoSubmissions, state.profiles],
  );
  const myEntry = useMemo(() => leaderboard.find(entry => entry.user_id === userId) ?? null, [leaderboard, userId]);
  const filteredCategories = useMemo(
    () => filterBallotCategories(state.categories, myVotesByCategory, filter, search),
    [filter, myVotesByCategory, search, state.categories],
  );

  const mutateVote = selectVote.mutateAsync;
  const handleSelect = useCallback((categoryId: string, nomineeId: string) => {
    mutateVote({ categoryId, nomineeId }).catch(error => {
      notify(errorMessage(error, 'Não foi possível salvar seu palpite no Bolão.'), 'error');
    });
  }, [mutateVote, notify]);

  async function handleConfirmToggle(confirm: boolean) {
    try {
      await setConfirmation.mutateAsync(confirm);
      notify(confirm ? 'Bolão GOTY 2026 confirmado!' : 'Bolão reaberto para ajustes');
      if (confirm) onReviewOpenChange(false);
    } catch (error) {
      notify(errorMessage(error, 'Não foi possível registrar a confirmação do seu Bolão.'), 'error');
    }
  }

  function jumpToCategory(categoryId: string) {
    onReviewOpenChange(false);
    onViewChange('ballot');
    setFilter('all');
    setSearch('');
    setTimeout(() => scrollToNode(categoryRefs.current.get(categoryId) ?? null), 350);
  }

  const viewOptions = useMemo(() => {
    const options: Array<{ value: BolaoView; label: string; icon: 'clipboard' | 'trophy' | 'shield-checkmark'; badge?: string | null }> = [
      { value: 'ballot', label: 'Votação', icon: 'clipboard' },
      { value: 'leaderboard', label: 'Placar', icon: 'trophy', badge: announcedCount > 0 ? `${announcedCount}/${state.categories.length}` : null },
    ];
    if (isAdmin) options.push({ value: 'admin', label: 'Admin', icon: 'shield-checkmark' });
    return options;
  }, [announcedCount, isAdmin, state.categories.length]);

  return (
    <View style={styles.stack}>
      <GotySegmented options={viewOptions} value={view} onChange={onViewChange} accessibilityLabel="Seções do Bolão" />

      {votingOpen ? (
        <GotyPill tone="emerald" icon="lock-open" label={`Bolão aberto · até ${formatDateTimePt(state.event.voting_closes_at)}`} />
      ) : (
        <GotyPill
          icon="lock-closed"
          label={state.event.status === 'results_published' ? 'Resultados oficiais publicados' : 'Bolão encerrado para palpites'}
        />
      )}

      {view === 'ballot' ? (
        <View style={styles.stack}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#9d8f70" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Filtrar categorias ou indicados…"
              placeholderTextColor={gotyColors.textFaint}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Filtrar categorias ou indicados"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Limpar busca">
                <Ionicons name="close-circle" size={16} color="#9d8f70" />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.bleed}>
            {BALLOT_FILTER_OPTIONS.map(option => (
              <GotyChip
                key={option.id}
                label={option.label}
                count={ballotFilterCount(option.id, state.categories, progress.answered)}
                active={filter === option.id}
                onPress={() => setFilter(option.id)}
              />
            ))}
          </ScrollView>

          {filteredCategories.length === 0 ? (
            <GotyEmpty
              title="Nenhuma categoria encontrada para este filtro"
              actionLabel={`Mostrar todas as ${state.categories.length} categorias`}
              onAction={() => {
                setFilter('all');
                setSearch('');
              }}
            />
          ) : (
            filteredCategories.map(category => (
              <View key={category.id} ref={node => { categoryRefs.current.set(category.id, node); }} collapsable={false}>
                <CategoryCard
                  category={category}
                  selectedNomineeId={myVotesByCategory.get(category.id) ?? null}
                  votingOpen={votingOpen}
                  isConfirmed={isConfirmed}
                  onSelect={handleSelect}
                />
              </View>
            ))
          )}
        </View>
      ) : null}

      {view === 'leaderboard' ? (
        <LeaderboardView
          leaderboard={leaderboard}
          myEntry={myEntry}
          announcedCount={announcedCount}
          totalCategories={state.categories.length}
          userId={userId}
          onInspect={setInspectEntry}
        />
      ) : null}

      {view === 'admin' && isAdmin ? <GotyBolaoAdmin state={state} announcedCount={announcedCount} /> : null}

      <GotySheet
        visible={reviewOpen}
        onClose={() => onReviewOpenChange(false)}
        title={isConfirmed ? 'Suas previsões confirmadas' : 'Revisar meu Bolão GOTY 2026'}
        description={`${progress.answered} de ${progress.total} categorias preenchidas`}
        fullHeight
        footer={(
          <View style={styles.reviewFooter}>
            <Text style={styles.reviewFooterNote}>
              {isConfirmed && mySubmission?.confirmed_at
                ? `Confirmado em ${formatDateTimePt(mySubmission.confirmed_at)}`
                : 'Seus palpites já ficam salvos automaticamente no seu perfil.'}
            </Text>
            <View style={styles.reviewActions}>
              <GotyButton label="Fechar" variant="quiet" onPress={() => onReviewOpenChange(false)} style={styles.flex1} />
              {votingOpen ? (
                <GotyButton
                  label={setConfirmation.isPending ? 'Salvando…' : isConfirmed ? 'Reabrir palpite' : 'Confirmar palpite'}
                  icon={isConfirmed ? 'lock-open' : 'checkmark-done'}
                  disabled={progress.answered === 0}
                  loading={setConfirmation.isPending}
                  onPress={() => void handleConfirmToggle(!isConfirmed)}
                  style={styles.flex2}
                />
              ) : null}
            </View>
          </View>
        )}
      >
        <ScrollView contentContainerStyle={styles.sheetList}>
          {!progress.isComplete && votingOpen ? (
            <View style={styles.warning}>
              <Text style={styles.warningText}>
                Você ainda tem <Text style={styles.bold}>{progress.missingCategoryIds.length}</Text>{' '}
                {progress.missingCategoryIds.length === 1 ? 'categoria pendente' : 'categorias pendentes'}. Você pode confirmar agora ou tocar em qualquer pendência abaixo para responder.
              </Text>
            </View>
          ) : null}
          {state.categories.map(category => {
            const chosenId = myVotesByCategory.get(category.id);
            const chosen = category.nominees.find(nominee => nominee.id === chosenId) ?? null;
            const winner = category.nominees.find(nominee => nominee.id === category.winner_nominee_id) ?? null;
            return (
              <PickRow
                key={category.id}
                category={category}
                pick={chosen}
                winner={winner}
                emptyLabel="Sem palpite ainda"
                highlightMissing
                action={votingOpen ? { label: chosen ? 'Alterar' : 'Responder', onPress: () => jumpToCategory(category.id) } : undefined}
              />
            );
          })}
        </ScrollView>
      </GotySheet>

      <GotySheet
        visible={Boolean(inspectEntry)}
        onClose={() => setInspectEntry(null)}
        title={inspectEntry ? `Palpites de ${inspectEntry.profile.name || 'Membro'}` : 'Palpites'}
        description={inspectEntry ? `${inspectEntry.correctCount} acertos · ${inspectEntry.votedCount}/${state.categories.length} categorias preenchidas` : undefined}
        fullHeight
      >
        {inspectEntry ? (
          <ScrollView contentContainerStyle={styles.sheetList}>
            {state.categories.map(category => {
              const vote = state.bolaoVotes.find(item => item.user_id === inspectEntry.user_id && item.category_id === category.id);
              const pick = category.nominees.find(nominee => nominee.id === vote?.nominee_id) ?? null;
              const winner = category.nominees.find(nominee => nominee.id === category.winner_nominee_id) ?? null;
              return <PickRow key={category.id} category={category} pick={pick} winner={winner} emptyLabel="Sem palpite" verbose />;
            })}
          </ScrollView>
        ) : null}
      </GotySheet>
    </View>
  );
}

export function GotyBolaoDock({
  progress,
  isConfirmed,
  votingOpen,
  correctCount,
  announcedCount,
  onReview,
  bottomInset,
}: {
  progress: GotyBolaoProgress;
  isConfirmed: boolean;
  votingOpen: boolean;
  correctCount: number | null;
  announcedCount: number;
  onReview: () => void;
  bottomInset: number;
}) {
  const primary = votingOpen && !isConfirmed;
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(10, bottomInset + 6) }]}>
      <View style={styles.flex1}>
        <View style={styles.dockLabels}>
          <Text style={gotyShared.eyebrow}>Progresso</Text>
          {isConfirmed ? (
            <GotyPill tone="emerald" icon="checkmark-circle" label="Confirmado" />
          ) : progress.answered > 0 ? (
            <Text style={styles.dockDraft}>Rascunho salvo</Text>
          ) : null}
          {announcedCount > 0 && correctCount != null ? (
            <GotyPill icon="trophy" label={`${correctCount}/${announcedCount}`} />
          ) : null}
        </View>
        <View style={styles.dockBarRow}>
          <View
            style={styles.progressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: progress.total, now: progress.answered }}
          >
            <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
          </View>
          <Text style={styles.dockCount}>{progress.answered}/{progress.total}</Text>
        </View>
      </View>
      <Pressable
        onPress={onReview}
        accessibilityRole="button"
        style={({ pressed }) => [primary ? styles.dockButtonPrimary : styles.dockButton, pressed && gotyShared.pressed]}
      >
        <Ionicons name="eye" size={14} color={primary ? gotyColors.onGold : '#f4e4b5'} />
        <Text style={primary ? styles.dockButtonPrimaryText : styles.dockButtonText}>
          {isConfirmed ? 'Ver' : votingOpen ? 'Revisar' : 'Palpites'}
        </Text>
      </Pressable>
    </View>
  );
}

const CategoryCard = memo(function CategoryCard({
  category,
  selectedNomineeId,
  votingOpen,
  isConfirmed,
  onSelect,
}: {
  category: GotyCategory;
  selectedNomineeId: string | null;
  votingOpen: boolean;
  isConfirmed: boolean;
  onSelect: (categoryId: string, nomineeId: string) => void;
}) {
  const isGoty = category.slug === 'game-of-the-year';
  const selected = category.nominees.find(nominee => nominee.id === selectedNomineeId) ?? null;
  const winner = category.nominees.find(nominee => nominee.id === category.winner_nominee_id) ?? null;
  const didHit = Boolean(winner && selected && winner.id === selected.id);
  const didMiss = Boolean(winner && selected && winner.id !== selected.id);

  return (
    <View style={[styles.categoryCard, isGoty ? styles.categoryGoty : selected ? styles.categoryAnswered : null]}>
      {isGoty ? <TgaEmblem size={180} opacity={0.06} style={styles.categoryWatermark} /> : null}
      <View style={styles.categoryTop}>
        <GotyPill
          tone={isGoty ? 'solidGold' : 'gold'}
          icon={isGoty ? 'ribbon' : undefined}
          label={isGoty ? 'Principal' : `Cat. ${category.display_order}`}
        />
        {didHit ? (
          <GotyPill tone="emerald" icon="checkmark-circle" label="Acertou!" />
        ) : didMiss ? (
          <GotyPill tone="red" icon="close-circle" label="Errou" />
        ) : selected ? (
          <GotyPill icon="checkmark" label={isConfirmed ? 'Confirmado' : 'Salvo'} />
        ) : (
          <GotyPill tone="muted" icon="time-outline" label="Pendente" />
        )}
      </View>
      <Text style={[styles.categoryTitle, isGoty && styles.categoryTitleGoty]}>{category.name_pt}</Text>
      <Text style={styles.categoryName}>{category.name}</Text>
      <Text style={styles.categoryDescription}>{category.description}</Text>

      <View style={styles.nomineeGrid}>
        {category.nominees.map(nominee => (
          <NomineeCard
            key={nominee.id}
            nominee={nominee}
            selected={nominee.id === selectedNomineeId}
            winner={nominee.id === category.winner_nominee_id}
            disabled={!votingOpen}
            onPress={() => onSelect(category.id, nominee.id)}
          />
        ))}
      </View>
    </View>
  );
});

function NomineeCard({
  nominee,
  selected,
  winner,
  disabled,
  onPress,
}: {
  nominee: GotyNominee;
  selected: boolean;
  winner: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${nominee.title}${nominee.subtitle ? `, ${nominee.subtitle}` : ''}${winner ? ', vencedor oficial' : ''}`}
      style={({ pressed }) => [
        styles.nominee,
        selected && styles.nomineeSelected,
        winner && styles.nomineeWinner,
        pressed && !disabled && gotyShared.pressed,
      ]}
    >
      <View style={styles.posterWrap}>
        <GotyPosterArt
          title={nominee.title}
          subtitle={nominee.subtitle}
          imageUrl={nominee.image_url}
          kind={nominee.nominee_kind}
          style={StyleSheet.absoluteFill}
        />
        {winner ? (
          <View style={styles.winnerBadge}>
            <Ionicons name="ribbon" size={10} color="#022c22" />
            <Text style={styles.winnerBadgeText}>Vencedor</Text>
          </View>
        ) : null}
        {selected ? (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={14} color={gotyColors.onGold} />
          </View>
        ) : null}
      </View>
      <View style={styles.nomineeBody}>
        <Text style={styles.nomineeTitle} numberOfLines={2}>{nominee.title}</Text>
        {nominee.subtitle ? <Text style={styles.nomineeSubtitle} numberOfLines={1}>{nominee.subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

function PickRow({
  category,
  pick,
  winner,
  emptyLabel,
  highlightMissing,
  verbose,
  action,
}: {
  category: GotyCategory;
  pick: GotyNominee | null;
  winner: GotyNominee | null;
  emptyLabel: string;
  highlightMissing?: boolean;
  verbose?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  const hit = Boolean(winner && pick && winner.id === pick.id);
  const missed = Boolean(winner && pick && winner.id !== pick.id);
  return (
    <View style={[styles.pickRow, !pick && highlightMissing && styles.pickRowMissing]}>
      <View style={styles.flex1}>
        <Text style={styles.pickRowCategory} numberOfLines={1}>{category.display_order}. {category.name_pt}</Text>
        {pick ? (
          <Text style={styles.pickRowTitle} numberOfLines={1}>{pick.title}</Text>
        ) : (
          <Text style={[styles.pickRowEmpty, highlightMissing && styles.pickRowEmptyWarn]}>{emptyLabel}</Text>
        )}
        {winner ? (
          <Text style={styles.pickRowWinner} numberOfLines={1}>{verbose ? 'Vencedor oficial' : 'Oficial'}: {winner.title}</Text>
        ) : null}
      </View>
      {hit ? (verbose ? <GotyPill tone="emerald" icon="checkmark" label="Acertou" /> : <Ionicons name="checkmark-circle" size={18} color={gotyColors.emerald} />) : null}
      {missed ? (verbose ? <GotyPill tone="red" icon="close-circle" label="Errou" /> : <Ionicons name="close-circle" size={18} color={gotyColors.red} />) : null}
      {action ? (
        <Pressable onPress={action.onPress} style={({ pressed }) => [styles.pickRowAction, pressed && gotyShared.pressed]} accessibilityRole="button">
          <Text style={styles.pickRowActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LeaderboardView({
  leaderboard,
  myEntry,
  announcedCount,
  totalCategories,
  userId,
  onInspect,
}: {
  leaderboard: GotyLeaderboardEntry[];
  myEntry: GotyLeaderboardEntry | null;
  announcedCount: number;
  totalCategories: number;
  userId: string;
  onInspect: (entry: GotyLeaderboardEntry) => void;
}) {
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
  return (
    <View style={styles.stack}>
      <View style={[gotyShared.card, styles.performanceCard]}>
        <View style={styles.rowGap}>
          <Ionicons name="medal" size={13} color={gotyColors.goldStrong} />
          <Text style={gotyShared.eyebrow}>Seu desempenho no Bolão</Text>
        </View>
        <Text style={styles.performanceTitle}>
          {announcedCount === 0
            ? 'Aguardando os vencedores oficiais'
            : myEntry
              ? `${myEntry.correctCount} ${plural(myEntry.correctCount, 'acerto', 'acertos')} em ${announcedCount} ${plural(announcedCount, 'categoria apurada', 'categorias apuradas')}`
              : 'Você ainda não registrou palpites'}
        </Text>
        <Text style={styles.performanceText}>
          {announcedCount === 0
            ? 'Assim que um administrador registrar os vencedores oficiais após a premiação, a pontuação e o placar serão calculados automaticamente.'
            : myEntry
              ? `Aproveitamento de ${myEntry.accuracyPercent}% · Posição atual: #${myEntry.rank}${myEntry.hitGoty ? ' · Acertou o Game of the Year!' : ''}`
              : 'Volte na Votação para preencher suas previsões.'}
        </Text>
        {myEntry ? (
          <View style={styles.statsRow}>
            <GotyStat label="Posição" value={`#${myEntry.rank}`} tone="gold" />
            <GotyStat label="Acertos" value={myEntry.correctCount} />
            <GotyStat label="Palpites" value={`${myEntry.votedCount}/${totalCategories}`} tone="muted" />
          </View>
        ) : null}
      </View>

      {announcedCount > 0 && leaderboard.length > 0 ? (
        <View style={styles.podium}>
          {leaderboard.slice(0, 3).map((entry, index) => (
            <Pressable
              key={entry.user_id}
              onPress={() => onInspect(entry)}
              accessibilityRole="button"
              accessibilityLabel={`${entry.rank}º lugar, ${entry.profile.name || 'Membro'}, ${entry.correctCount} acertos`}
              style={({ pressed }) => [styles.podiumCard, index === 0 && styles.podiumFirst, pressed && gotyShared.pressed]}
            >
              <View style={styles.podiumTop}>
                <View style={[styles.podiumRank, index === 1 && styles.podiumSilver, index === 2 && styles.podiumBronze]}>
                  {index === 0 ? <Ionicons name="ribbon" size={11} color={gotyColors.onGold} /> : null}
                  <Text style={[styles.podiumRankText, index === 2 && styles.podiumBronzeText]}>#{entry.rank} lugar</Text>
                </View>
                {entry.hitGoty ? <GotyPill label="Acertou GOTY" /> : null}
              </View>
              <View style={styles.podiumBody}>
                <View style={styles.avatarRing}>
                  <Avatar uri={entry.profile.avatar_url} crop={entry.profile.avatar_crop} name={entry.profile.name} size={44} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.podiumName} numberOfLines={1}>{entry.profile.name || 'Membro'}</Text>
                  <Text style={styles.podiumScore}>
                    {entry.correctCount} {plural(entry.correctCount, 'acerto', 'acertos')} ({entry.accuracyPercent}%)
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <View style={styles.flex1}>
            <Text style={styles.tableTitle}>Classificação geral do clube</Text>
            <Text style={styles.tableSubtitle}>
              {leaderboard.length} {plural(leaderboard.length, 'participante', 'participantes')} · Toque em alguém para ver os palpites
            </Text>
          </View>
          <GotyPill label={`${announcedCount}/${totalCategories} apuradas`} />
        </View>
        {leaderboard.length === 0 ? (
          <Text style={styles.tableEmpty}>Nenhum membro registrou palpites no Bolão 2026 ainda.</Text>
        ) : (
          leaderboard.map((entry, index) => {
            const isMe = entry.user_id === userId;
            return (
              <Pressable
                key={entry.user_id}
                onPress={() => onInspect(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Posição ${entry.rank}, ${entry.profile.name || 'Membro'}, ${entry.correctCount} acertos`}
                style={({ pressed }) => [
                  styles.tableRow,
                  index > 0 && styles.tableRowDivider,
                  isMe && styles.tableRowMe,
                  pressed && styles.tableRowPressed,
                ]}
              >
                <Text style={styles.tableRank}>#{entry.rank}</Text>
                <Avatar uri={entry.profile.avatar_url} crop={entry.profile.avatar_crop} name={entry.profile.name} size={38} />
                <View style={styles.flex1}>
                  <View style={styles.rowGap}>
                    <Text style={styles.tableName} numberOfLines={1}>{entry.profile.name || 'Membro'}</Text>
                    {isMe ? <GotyPill label="Você" /> : null}
                    {entry.hitGoty && announcedCount > 0 ? <GotyPill tone="emerald" label="GOTY ✓" /> : null}
                  </View>
                  <Text style={styles.tableMeta}>
                    {entry.votedCount}/{totalCategories} preenchidas · {entry.confirmedAt ? 'Confirmado' : 'Em rascunho'}
                  </Text>
                </View>
                <View style={styles.tableScore}>
                  <Text style={styles.tableScoreValue}>
                    {entry.correctCount}
                    <Text style={styles.tableScoreTotal}>/{announcedCount || totalCategories}</Text>
                  </Text>
                  <Text style={styles.tableScoreLabel}>{announcedCount > 0 ? `${entry.accuracyPercent}%` : 'Aguardando'}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  flex1: { flex: 1, minWidth: 0 },
  flex2: { flex: 2 },
  bold: { fontWeight: '900' },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  bleed: { marginHorizontal: -16 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.18)',
    backgroundColor: gotyColors.surfaceInput,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: '#faf4e4', fontSize: 14, paddingVertical: 10 },
  chipRow: { gap: 6, paddingHorizontal: 16 },
  categoryCard: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: gotyColors.surfaceSunken,
    padding: 14,
  },
  categoryGoty: {
    borderColor: 'rgba(232,198,109,0.55)',
    backgroundColor: '#15120c',
    shadowColor: '#dcb24a',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  categoryAnswered: { borderColor: 'rgba(223,192,108,0.3)', backgroundColor: gotyColors.surface },
  categoryWatermark: { position: 'absolute', right: -40, top: -40 },
  categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  categoryTitle: { color: '#fff9ea', fontSize: 17, fontWeight: '900', letterSpacing: -0.3, marginTop: 10 },
  categoryTitleGoty: { fontSize: 21 },
  categoryName: { color: '#9a8e74', fontSize: 11, fontWeight: '700', marginTop: 2 },
  categoryDescription: { color: '#a89c7f', fontSize: 12, lineHeight: 17, marginTop: 6 },
  nomineeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 14 },
  nominee: {
    width: '48.5%',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: gotyColors.surfaceCard,
  },
  nomineeSelected: {
    borderColor: gotyColors.goldBright,
    backgroundColor: '#1d180d',
    shadowColor: '#dab048',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  nomineeWinner: { borderColor: gotyColors.emerald, borderWidth: 2 },
  posterWrap: { width: '100%', aspectRatio: 3 / 4 },
  winnerBadge: {
    position: 'absolute',
    left: 6,
    top: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    backgroundColor: '#10b981',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  winnerBadgeText: { color: '#022c22', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  checkBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0d586',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nomineeBody: { padding: 9, gap: 3 },
  nomineeTitle: { color: gotyColors.text, fontSize: 12, fontWeight: '800', lineHeight: 15 },
  nomineeSubtitle: { color: gotyColors.textSubtle, fontSize: 10, fontWeight: '500' },
  sheetList: { padding: 14, gap: 8 },
  warning: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: gotyColors.amberBorder,
    backgroundColor: gotyColors.amberTint,
    padding: 12,
    marginBottom: 4,
  },
  warningText: { color: gotyColors.amberText, fontSize: 12, lineHeight: 17 },
  reviewFooter: { gap: 10 },
  reviewFooterNote: { color: '#a79c82', fontSize: 11 },
  reviewActions: { flexDirection: 'row', gap: 8 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: gotyColors.surfaceRow,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickRowMissing: { borderStyle: 'dashed', borderColor: 'rgba(251,191,36,0.3)', backgroundColor: 'rgba(245,158,11,0.04)' },
  pickRowCategory: { color: '#a99c7e', fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  pickRowTitle: { color: '#fff8e6', fontSize: 13, fontWeight: '800', marginTop: 2 },
  pickRowEmpty: { color: gotyColors.textSubtle, fontSize: 12, fontWeight: '600', marginTop: 2 },
  pickRowEmptyWarn: { color: 'rgba(253,230,138,0.85)' },
  pickRowWinner: { color: gotyColors.goldStrong, fontSize: 10, fontWeight: '700', marginTop: 2 },
  pickRowAction: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: gotyColors.white04,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pickRowActionText: { color: '#dfd2b0', fontSize: 11, fontWeight: '700' },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(223,192,108,0.25)',
    backgroundColor: 'rgba(14,13,19,0.97)',
    paddingHorizontal: 16,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  dockLabels: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dockDraft: { color: '#efd68e', fontSize: 10, fontWeight: '700' },
  dockBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  progressTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#e2bc5b' },
  dockCount: { color: '#f9f1d8', fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dockButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: gotyColors.goldStrong,
  },
  dockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.3)',
    backgroundColor: '#181620',
  },
  dockButtonPrimaryText: { color: gotyColors.onGold, fontSize: 12, fontWeight: '900' },
  dockButtonText: { color: '#f4e4b5', fontSize: 12, fontWeight: '900' },
  performanceCard: { backgroundColor: '#14110b', borderColor: 'rgba(223,192,108,0.3)', gap: 6 },
  performanceTitle: { color: gotyColors.textStrong, fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  performanceText: { color: gotyColors.textMuted, fontSize: 12, lineHeight: 17 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  podium: { gap: 10 },
  podiumCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: gotyColors.surfaceAlt,
    padding: 14,
  },
  podiumFirst: {
    borderColor: 'rgba(240,207,114,0.55)',
    backgroundColor: '#1d170c',
    shadowColor: '#dcb24a',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  podiumTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  podiumRank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#e8c362',
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  podiumSilver: { backgroundColor: gotyColors.silver },
  podiumBronze: { backgroundColor: gotyColors.bronze },
  podiumRankText: { color: gotyColors.onGold, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  podiumBronzeText: { color: '#fef3c7' },
  podiumBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  avatarRing: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(223,192,108,0.4)', padding: 1 },
  podiumName: { color: gotyColors.textStrong, fontSize: 14, fontWeight: '900' },
  podiumScore: { color: '#e5c36b', fontSize: 12, fontWeight: '700', marginTop: 2 },
  tableCard: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: '#0f0e14',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(223,192,108,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tableTitle: { color: '#fff8e6', fontSize: 14, fontWeight: '900' },
  tableSubtitle: { color: '#a79c82', fontSize: 11, marginTop: 2 },
  tableEmpty: { color: '#9e9278', fontSize: 12, textAlign: 'center', padding: 24 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  tableRowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  tableRowMe: { backgroundColor: 'rgba(223,192,108,0.07)' },
  tableRowPressed: { backgroundColor: 'rgba(223,192,108,0.1)' },
  tableRank: { width: 30, textAlign: 'center', color: gotyColors.goldStrong, fontSize: 12, fontWeight: '900' },
  tableName: { color: '#faf4e4', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  tableMeta: { color: '#9b8f76', fontSize: 11, marginTop: 2 },
  tableScore: { alignItems: 'flex-end' },
  tableScoreValue: { color: '#fff8e6', fontSize: 16, fontWeight: '900' },
  tableScoreTotal: { color: '#9b8f76', fontSize: 11, fontWeight: '700' },
  tableScoreLabel: { color: '#c7b588', fontSize: 10, fontWeight: '700' },
});
