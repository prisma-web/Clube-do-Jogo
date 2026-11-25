import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  computePersonalCommunityWall,
  type GotyCommunityGameSummary,
  type GotyCommunityMemberShowcase,
  type GotyFullState,
  type GotyPersonalCategory,
  type GotySearchGameResult,
} from '@clube-do-jogo/domain';
import { Avatar } from '@/components/Avatar';
import { useClearPersonalPick, useSavePersonalPick } from '@/state/goty-queries';
import { isUuid, pickMetaLine, titleKey, type PersonalSubView } from './goty-logic';
import { gotyColors, gotyShared } from './goty-theme';
import { GotyGamePickerSheet } from './GotyGamePickerSheet';
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

type IconName = keyof typeof Ionicons.glyphMap;

const CATEGORY_ICONS: Record<string, IconName> = {
  'meu-goty': 'ribbon',
  'melhor-narrativa': 'book',
  'melhor-direcao-de-arte': 'color-palette',
  'melhor-trilha-sonora': 'musical-notes',
  'melhor-gameplay': 'game-controller',
  'maior-surpresa': 'sparkles',
  'melhor-multiplayer': 'people',
  'jogo-que-mais-marcou': 'heart',
  'maior-decepcao': 'thumbs-down',
};

function categoryIcon(slug: string): IconName {
  return CATEGORY_ICONS[slug] ?? 'flame';
}

export function GotyPersonalTab({ state, userId }: { state: GotyFullState; userId: string }) {
  const router = useRouter();
  const notify = useGotyNotify();
  const savePick = useSavePersonalPick();
  const clearPick = useClearPersonalPick();
  const [subView, setSubView] = useState<PersonalSubView>('mine');
  const [pickerCategory, setPickerCategory] = useState<GotyPersonalCategory | null>(null);
  const [wallCategoryFilter, setWallCategoryFilter] = useState<string>('all');
  const [selectedGame, setSelectedGame] = useState<GotyCommunityGameSummary | null>(null);
  const [selectedMember, setSelectedMember] = useState<GotyCommunityMemberShowcase | null>(null);

  const personalVotingOpen = state.event.personal_voting_open;
  const myPicks = useMemo(() => state.personalPicks.filter(pick => pick.user_id === userId), [state.personalPicks, userId]);
  const myPickByCategory = useMemo(() => new Map(myPicks.map(pick => [pick.category_id, pick])), [myPicks]);
  const myTitles = useMemo(() => new Set(myPicks.map(pick => titleKey(pick.game_title))), [myPicks]);

  const filteredWallPicks = useMemo(
    () => (wallCategoryFilter === 'all' ? state.personalPicks : state.personalPicks.filter(pick => pick.category_id === wallCategoryFilter)),
    [state.personalPicks, wallCategoryFilter],
  );
  const wall = useMemo(
    () => computePersonalCommunityWall(filteredWallPicks, state.personalCategories, state.profiles),
    [filteredWallPicks, state.personalCategories, state.profiles],
  );
  const fullWall = useMemo(
    () => computePersonalCommunityWall(state.personalPicks, state.personalCategories, state.profiles),
    [state.personalPicks, state.personalCategories, state.profiles],
  );

  const mainCategory = state.personalCategories.find(category => category.slug === 'meu-goty') ?? state.personalCategories[0] ?? null;
  const secondaryCategories = state.personalCategories.filter(category => category.id !== mainCategory?.id);
  const mainPick = mainCategory ? myPickByCategory.get(mainCategory.id) ?? null : null;

  async function handleSave(game: GotySearchGameResult): Promise<boolean> {
    if (!pickerCategory) return false;
    try {
      await savePick.mutateAsync({ categoryId: pickerCategory.id, game });
      notify('Escolha salva no Seu GOTY');
      return true;
    } catch (error) {
      notify(errorMessage(error, 'Não foi possível salvar sua escolha no Seu GOTY.'), 'error');
      return false;
    }
  }

  async function handleClear(categoryId: string) {
    try {
      await clearPick.mutateAsync(categoryId);
      notify('Escolha removida');
    } catch (error) {
      notify(errorMessage(error, 'Não foi possível remover sua escolha.'), 'error');
    }
  }

  function openGamePage(gameId: string) {
    setSelectedGame(null);
    router.push({ pathname: '/(app)/jogos/[id]', params: { id: gameId } });
  }

  return (
    <View style={styles.stack}>
      <GotySegmented
        accessibilityLabel="Seções do Seu GOTY"
        value={subView}
        onChange={setSubView}
        options={[
          { value: 'mine', label: 'Minhas escolhas', icon: 'heart', badge: `${myPicks.length}/${state.personalCategories.length}` },
          { value: 'wall', label: 'Mural do clube', icon: 'grid', badge: fullWall.totalParticipants },
        ]}
      />
      <Text style={styles.note}>Votação afetiva e independente do Bolão · Priorizando lançamentos comerciais de 2026</Text>
      {!personalVotingOpen ? (
        <GotyPill icon="lock-closed" label="Edições do Seu GOTY encerradas pela administração" />
      ) : null}

      {subView === 'mine' ? (
        <View style={styles.stack}>
          {mainCategory ? (
            <View style={styles.mainCard}>
              {mainPick ? (
                <GotyPosterArt title={mainPick.game_title} imageUrl={mainPick.game_image_url} style={styles.mainPoster} />
              ) : (
                <Pressable
                  onPress={() => setPickerCategory(mainCategory)}
                  disabled={!personalVotingOpen}
                  accessibilityRole="button"
                  accessibilityLabel="Escolher Meu GOTY"
                  style={({ pressed }) => [styles.mainPlaceholder, !personalVotingOpen && gotyShared.disabled, pressed && gotyShared.pressed]}
                >
                  <View style={styles.plusCircle}>
                    <Ionicons name="add" size={22} color={gotyColors.goldText} />
                  </View>
                  <Text style={styles.placeholderText}>Escolher Meu GOTY</Text>
                </Pressable>
              )}
              <GotyPill tone="solidGold" icon="ribbon" label={`${mainCategory.name} · 2026`} style={styles.centerSelf} />
              <Text style={styles.mainTitle}>{mainPick ? mainPick.game_title : 'Qual foi o seu jogo do ano?'}</Text>
              <Text style={styles.mainText}>
                {mainPick ? pickMetaLine(mainPick, { yearPrefix: 'Lançamento ', platforms: 3 }) : mainCategory.description}
              </Text>
              {personalVotingOpen ? (
                <View style={styles.mainActions}>
                  <GotyButton
                    label={mainPick ? 'Trocar jogo' : 'Escolher jogo de 2026'}
                    icon={mainPick ? 'pencil' : 'add'}
                    onPress={() => setPickerCategory(mainCategory)}
                  />
                  {mainPick ? (
                    <GotyButton label="Remover" icon="trash" variant="quiet" onPress={() => void handleClear(mainCategory.id)} />
                  ) : null}
                  <GotyButton label="Ver mural do clube" icon="grid" variant="ghost" onPress={() => setSubView('wall')} />
                </View>
              ) : null}
            </View>
          ) : null}

          {secondaryCategories.map(category => {
            const pick = myPickByCategory.get(category.id) ?? null;
            return (
              <View key={category.id} style={[styles.secondaryCard, pick && styles.secondaryCardFilled]}>
                <View style={styles.secondaryRow}>
                  {pick ? (
                    <GotyPosterArt title={pick.game_title} imageUrl={pick.game_image_url} compact style={styles.smallPoster} />
                  ) : (
                    <Pressable
                      onPress={() => setPickerCategory(category)}
                      disabled={!personalVotingOpen}
                      accessibilityRole="button"
                      accessibilityLabel={`Escolher jogo para ${category.name}`}
                      style={({ pressed }) => [styles.smallPlaceholder, !personalVotingOpen && gotyShared.disabled, pressed && gotyShared.pressed]}
                    >
                      <Ionicons name="add" size={22} color="#d9b65b" />
                    </Pressable>
                  )}
                  <View style={styles.flex1}>
                    <View style={styles.rowGap}>
                      <Ionicons name={categoryIcon(category.slug)} size={12} color={gotyColors.goldStrong} />
                      <Text style={styles.categoryEyebrow} numberOfLines={1}>{category.name}</Text>
                    </View>
                    {pick ? (
                      <>
                        <Text style={styles.secondaryTitle} numberOfLines={2}>{pick.game_title}</Text>
                        <Text style={styles.secondaryMeta} numberOfLines={2}>{pickMetaLine(pick)}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.secondaryEmpty}>Ainda sem escolha</Text>
                        <Text style={styles.secondaryMeta}>{category.description}</Text>
                      </>
                    )}
                  </View>
                </View>
                {personalVotingOpen ? (
                  <View style={styles.secondaryActions}>
                    {pick ? (
                      <Pressable
                        onPress={() => void handleClear(category.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remover escolha de ${category.name}`}
                        style={({ pressed }) => [styles.textAction, pressed && gotyShared.pressed]}
                      >
                        <Ionicons name="trash" size={12} color="#9c9077" />
                        <Text style={styles.textActionLabel}>Remover</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => setPickerCategory(category)}
                      accessibilityRole="button"
                      style={({ pressed }) => [pick ? styles.smallGhost : styles.smallGold, pressed && gotyShared.pressed]}
                    >
                      <Ionicons name={pick ? 'pencil' : 'add'} size={12} color={pick ? gotyColors.goldText : gotyColors.onGold} />
                      <Text style={pick ? styles.smallGhostText : styles.smallGoldText}>{pick ? 'Trocar' : 'Escolher jogo'}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.stackLarge}>
          <View style={[gotyShared.card, styles.wallIntro]}>
            <View style={styles.rowGap}>
              <Ionicons name="sparkles" size={13} color={gotyColors.goldStrong} />
              <Text style={gotyShared.eyebrow}>Retrospectiva coletiva 2026</Text>
            </View>
            <Text style={styles.wallTitle}>Os GOTYs do Clube</Text>
            <Text style={styles.wallText}>
              Mosaico vivo com os jogos mais escolhidos pela comunidade. Toque em qualquer capa ou membro para descobrir afinidades.
            </Text>
            <View style={styles.statsRow}>
              <GotyStat label="Membros" value={fullWall.totalParticipants} tone="gold" />
              <GotyStat label="Escolhas" value={fullWall.totalPicks} />
              <GotyStat label="Jogos" value={fullWall.topGames.length} tone="muted" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipBleed}>
              <GotyChip label="Todas as categorias" active={wallCategoryFilter === 'all'} onPress={() => setWallCategoryFilter('all')} />
              {state.personalCategories.map(category => (
                <GotyChip
                  key={category.id}
                  label={category.name}
                  icon={categoryIcon(category.slug)}
                  active={wallCategoryFilter === category.id}
                  onPress={() => setWallCategoryFilter(category.id)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={styles.stack}>
            <View>
              <Text style={styles.sectionTitle}>Jogos mais escolhidos</Text>
              <Text style={styles.sectionText}>Toque em uma capa para ver quem escolheu e em quais prêmios o jogo apareceu.</Text>
            </View>
            {wall.topGames.length === 0 ? (
              <GotyEmpty
                title="Nenhuma escolha registrada nesta categoria ainda"
                actionLabel="Fazer minhas escolhas"
                onAction={() => setSubView('mine')}
              />
            ) : (
              <View style={styles.mosaic}>
                {wall.topGames.map((summary, index) => {
                  const spotlight = index === 0 && wall.topGames.length >= 3;
                  const shared = myTitles.has(titleKey(summary.title));
                  return (
                    <Pressable
                      key={summary.key}
                      onPress={() => setSelectedGame(summary)}
                      accessibilityRole="button"
                      accessibilityLabel={`${summary.title}, escolhido por ${summary.uniqueMembersCount} ${summary.uniqueMembersCount === 1 ? 'membro' : 'membros'}`}
                      style={({ pressed }) => [styles.mosaicCard, spotlight && styles.mosaicSpotlight, pressed && gotyShared.pressed]}
                    >
                      <View style={spotlight ? styles.posterWide : styles.posterTall}>
                        <GotyPosterArt
                          title={summary.title}
                          subtitle={summary.genres.slice(0, 2).join(' · ')}
                          imageUrl={summary.image_url}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.mosaicBadges}>
                          <View style={styles.countBadge}>
                            {index === 0 ? <Ionicons name="ribbon" size={11} color={gotyColors.onGold} /> : null}
                            <Text style={styles.countBadgeText}>
                              {summary.uniqueMembersCount} {summary.uniqueMembersCount === 1 ? 'membro' : 'membros'}
                            </Text>
                          </View>
                          {shared ? <GotyPill tone="emerald" label="Você também" /> : null}
                        </View>
                        <View style={styles.avatarStack}>
                          {summary.members.slice(0, 4).map((member, memberIndex) => (
                            <View key={member.id} style={[styles.stackedAvatar, memberIndex > 0 && styles.stackedOverlap]}>
                              <Avatar uri={member.avatar_url} crop={member.avatar_crop} name={member.name} size={26} />
                            </View>
                          ))}
                          {summary.members.length > 4 ? (
                            <View style={[styles.stackedAvatar, styles.stackedOverlap, styles.moreAvatar]}>
                              <Text style={styles.moreAvatarText}>+{summary.members.length - 4}</Text>
                            </View>
                          ) : null}
                          {summary.totalPicks > summary.uniqueMembersCount ? (
                            <Text style={styles.citations}>{summary.totalPicks} citações</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.mosaicBody}>
                        <Text style={[styles.mosaicTitle, spotlight && styles.mosaicTitleLarge]} numberOfLines={2}>{summary.title}</Text>
                        <Text style={styles.mosaicMeta} numberOfLines={1}>
                          {summary.categoryNames.slice(0, 3).join(' · ')}
                          {summary.categoryNames.length > 3 ? ` +${summary.categoryNames.length - 3}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.stack}>
            <View>
              <Text style={styles.sectionTitle}>GOTYs pessoais de cada membro</Text>
              <Text style={styles.sectionText}>Explore a seleção completa de cada pessoa do clube e descubra jogos em comum.</Text>
            </View>
            {fullWall.memberShowcases.length === 0 ? (
              <GotyEmpty title="Ainda ninguém preencheu o Seu GOTY 2026. Seja o primeiro!" />
            ) : (
              fullWall.memberShowcases.map(member => {
                const isMe = member.user_id === userId;
                const sharedCount = isMe
                  ? 0
                  : new Set(member.picks.map(item => titleKey(item.pick.game_title)).filter(title => myTitles.has(title))).size;
                const posterPick = member.mainGotyPick ?? member.picks[0]?.pick ?? null;
                return (
                  <Pressable
                    key={member.user_id}
                    onPress={() => setSelectedMember(member)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver GOTYs de ${member.profile.name || 'Membro'}`}
                    style={({ pressed }) => [styles.memberCard, pressed && gotyShared.pressed]}
                  >
                    <GotyPosterArt
                      title={posterPick?.game_title || 'GOTY 2026'}
                      imageUrl={posterPick?.game_image_url}
                      compact
                      style={styles.smallPoster}
                    />
                    <View style={styles.flex1}>
                      <View style={styles.rowGap}>
                        <Avatar uri={member.profile.avatar_url} crop={member.profile.avatar_crop} name={member.profile.name} size={26} />
                        <Text style={styles.memberName} numberOfLines={1}>{member.profile.name || 'Membro'}</Text>
                        {isMe ? <GotyPill label="Você" /> : null}
                      </View>
                      {member.mainGotyPick ? (
                        <Text style={styles.memberGoty} numberOfLines={1}>
                          Meu GOTY: <Text style={styles.memberGotyTitle}>{member.mainGotyPick.game_title}</Text>
                        </Text>
                      ) : (
                        <Text style={styles.memberCount}>
                          {member.picksCount} {member.picksCount === 1 ? 'categoria preenchida' : 'categorias preenchidas'}
                        </Text>
                      )}
                      <View style={styles.rowGap}>
                        <GotyPill tone="muted" label={`${member.picksCount}/${state.personalCategories.length} escolhas`} />
                        {sharedCount > 0 ? (
                          <GotyPill tone="emerald" label={`${sharedCount} ${sharedCount === 1 ? 'jogo em comum' : 'jogos em comum'}`} />
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      )}

      <GotyGamePickerSheet
        category={pickerCategory}
        selectedTitle={pickerCategory ? myPickByCategory.get(pickerCategory.id)?.game_title : null}
        onClose={() => setPickerCategory(null)}
        onSelect={handleSave}
      />

      <GotySheet
        visible={Boolean(selectedGame)}
        onClose={() => setSelectedGame(null)}
        title={selectedGame?.title || 'Jogo no mural'}
        description={selectedGame
          ? `Escolhido por ${selectedGame.uniqueMembersCount} ${selectedGame.uniqueMembersCount === 1 ? 'membro' : 'membros'} em ${selectedGame.totalPicks} ${selectedGame.totalPicks === 1 ? 'categoria' : 'categorias'}`
          : undefined}
      >
        {selectedGame ? (
          <ScrollView contentContainerStyle={styles.sheetList}>
            <View style={styles.gameHeader}>
              <GotyPosterArt title={selectedGame.title} imageUrl={selectedGame.image_url} compact style={styles.smallPoster} />
              <View style={styles.flex1}>
                <Text style={styles.gameHeaderTitle}>{selectedGame.title}</Text>
                <Text style={styles.secondaryMeta}>
                  {[selectedGame.release_year ? `Lançamento ${selectedGame.release_year}` : null, ...selectedGame.genres.slice(0, 2)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {isUuid(selectedGame.game_id) ? (
                  <Pressable
                    onPress={() => openGamePage(selectedGame.game_id as string)}
                    accessibilityRole="link"
                    style={({ pressed }) => [styles.linkRow, pressed && gotyShared.pressed]}
                  >
                    <Text style={styles.linkText}>Ver página do jogo no clube</Text>
                    <Ionicons name="arrow-forward" size={13} color="#f2d687" />
                  </Pressable>
                ) : null}
              </View>
            </View>
            {selectedGame.picks.map((detail, index) => (
              <View key={`${detail.user_id}:${detail.category_id}:${index}`} style={styles.detailRow}>
                <Avatar uri={detail.profile.avatar_url} crop={detail.profile.avatar_crop} name={detail.profile.name} size={34} />
                <View style={styles.flex1}>
                  <Text style={styles.detailName} numberOfLines={1}>{detail.profile.name || 'Membro'}</Text>
                  <Text style={styles.detailCategory}>{detail.category_name}</Text>
                </View>
                <Ionicons name={categoryIcon(detail.category_slug)} size={16} color="#c7b483" />
              </View>
            ))}
          </ScrollView>
        ) : null}
      </GotySheet>

      <GotySheet
        visible={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
        title={selectedMember ? `GOTYs 2026 de ${selectedMember.profile.name || 'Membro'}` : 'GOTYs do membro'}
        description={selectedMember ? `${selectedMember.picksCount} categorias preenchidas no Seu GOTY` : undefined}
      >
        {selectedMember ? (
          <ScrollView contentContainerStyle={styles.sheetList}>
            {selectedMember.picks.map(({ category, pick }) => {
              const shared = selectedMember.user_id !== userId && myTitles.has(titleKey(pick.game_title));
              return (
                <View key={category.id} style={styles.detailRow}>
                  <GotyPosterArt title={pick.game_title} imageUrl={pick.game_image_url} compact style={styles.tinyPoster} />
                  <View style={styles.flex1}>
                    <View style={styles.rowGap}>
                      <Ionicons name={categoryIcon(category.slug)} size={11} color={gotyColors.goldStrong} />
                      <Text style={styles.categoryEyebrow} numberOfLines={1}>{category.name}</Text>
                    </View>
                    <Text style={styles.detailName} numberOfLines={2}>{pick.game_title}</Text>
                  </View>
                  {shared ? <GotyPill tone="emerald" label="Em comum" /> : null}
                </View>
              );
            })}
          </ScrollView>
        ) : null}
      </GotySheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  stackLarge: { gap: 22 },
  flex1: { flex: 1, minWidth: 0 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  centerSelf: { alignSelf: 'center' },
  note: { color: '#a79c82', fontSize: 11, fontWeight: '600' },
  mainCard: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(232,198,109,0.45)',
    backgroundColor: '#16120b',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  mainPoster: {
    width: 150,
    aspectRatio: 3 / 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(240,207,114,0.4)',
  },
  mainPlaceholder: {
    width: 150,
    aspectRatio: 3 / 4,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(223,192,108,0.35)',
    backgroundColor: 'rgba(21,19,28,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  plusCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.35)',
    backgroundColor: 'rgba(223,192,108,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: '#f2dfb0', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  mainTitle: { color: gotyColors.textStrong, fontSize: 23, fontWeight: '900', letterSpacing: -0.4, textAlign: 'center' },
  mainText: { color: gotyColors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  mainActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 },
  secondaryCard: {
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: gotyColors.surfaceSunken,
    padding: 14,
  },
  secondaryCardFilled: { borderColor: 'rgba(223,192,108,0.3)', backgroundColor: gotyColors.surfaceAlt },
  secondaryRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  smallPoster: { width: 68, height: 96, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(223,192,108,0.3)' },
  tinyPoster: { width: 46, height: 64, borderRadius: 9, borderWidth: 1, borderColor: gotyColors.hairline },
  smallPlaceholder: {
    width: 68,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(223,192,108,0.3)',
    backgroundColor: '#15141c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEyebrow: { color: '#e3c168', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 1 },
  secondaryTitle: { color: gotyColors.textStrong, fontSize: 14, fontWeight: '900', marginTop: 4 },
  secondaryEmpty: { color: '#c7bca1', fontSize: 14, fontWeight: '700', marginTop: 4 },
  secondaryMeta: { color: gotyColors.textSubtle, fontSize: 11, lineHeight: 16, marginTop: 3 },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34, paddingHorizontal: 10, borderRadius: 10 },
  textActionLabel: { color: '#9c9077', fontSize: 12, fontWeight: '700' },
  smallGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: gotyColors.gold,
  },
  smallGoldText: { color: gotyColors.onGold, fontSize: 12, fontWeight: '900' },
  smallGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.25)',
    backgroundColor: gotyColors.goldTint,
  },
  smallGhostText: { color: gotyColors.goldText, fontSize: 12, fontWeight: '800' },
  wallIntro: { backgroundColor: '#14110b', borderColor: 'rgba(223,192,108,0.3)', gap: 6 },
  wallTitle: { color: gotyColors.textStrong, fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  wallText: { color: '#b3a689', fontSize: 12, lineHeight: 17 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chipRow: { gap: 6, paddingHorizontal: 16 },
  chipBleed: { marginHorizontal: -16, marginTop: 10 },
  sectionTitle: { color: gotyColors.textStrong, fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  sectionText: { color: '#9e9278', fontSize: 12, marginTop: 2 },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  mosaicCard: {
    width: '48.5%',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: gotyColors.surfaceAlt,
  },
  mosaicSpotlight: {
    width: '100%',
    borderColor: 'rgba(232,198,109,0.55)',
    backgroundColor: '#17130b',
    shadowColor: '#dab048',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  posterTall: { width: '100%', aspectRatio: 3 / 4 },
  posterWide: { width: '100%', aspectRatio: 16 / 10 },
  mosaicBadges: { position: 'absolute', left: 8, top: 8, right: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#e8c362',
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  countBadgeText: { color: gotyColors.onGold, fontSize: 10, fontWeight: '900' },
  avatarStack: { position: 'absolute', left: 8, right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center' },
  stackedAvatar: { borderRadius: 999, borderWidth: 2, borderColor: gotyColors.stageRaised },
  stackedOverlap: { marginLeft: -8 },
  moreAvatar: { width: 30, height: 30, backgroundColor: '#1e1a12', alignItems: 'center', justifyContent: 'center' },
  moreAvatarText: { color: '#f4df9b', fontSize: 9, fontWeight: '900' },
  citations: {
    marginLeft: 'auto',
    color: '#e5d2a0',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  mosaicBody: { padding: 10, gap: 4 },
  mosaicTitle: { color: gotyColors.textStrong, fontSize: 13, fontWeight: '900', letterSpacing: -0.2 },
  mosaicTitleLarge: { fontSize: 17 },
  mosaicMeta: { color: '#b8aa8c', fontSize: 10, fontWeight: '600' },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: '#100f16',
    padding: 14,
  },
  memberName: { color: gotyColors.textStrong, fontSize: 14, fontWeight: '900', flexShrink: 1 },
  memberGoty: { color: '#efd68e', fontSize: 12, fontWeight: '700', marginVertical: 6 },
  memberGotyTitle: { color: gotyColors.textStrong },
  memberCount: { color: '#9d9177', fontSize: 12, fontWeight: '600', marginVertical: 6 },
  sheetList: { padding: 14, gap: 8 },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.2)',
    backgroundColor: gotyColors.surfaceRow,
    padding: 12,
    marginBottom: 6,
  },
  gameHeaderTitle: { color: gotyColors.textStrong, fontSize: 16, fontWeight: '900' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
  linkText: { color: '#f2d687', fontSize: 12, fontWeight: '800' },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: gotyColors.surfaceCard,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailName: { color: '#faf4e4', fontSize: 13, fontWeight: '800' },
  detailCategory: { color: '#e3c168', fontSize: 11, fontWeight: '600', marginTop: 2 },
});
