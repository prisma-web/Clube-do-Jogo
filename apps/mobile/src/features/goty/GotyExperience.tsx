import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { computeBolaoLeaderboard, GOTY_2026_SOURCE } from '@clube-do-jogo/domain';
import { useApp } from '@/state/app-provider';
import { useGotyAutoResolveCovers, useGotyState } from '@/state/goty-queries';
import { formatCeremonyDate, parseGotyTab, type BolaoView, type GotyTab } from './goty-logic';
import { gotyColors, gotyShared } from './goty-theme';
import { GotyBolaoDock, GotyBolaoTab, useBolaoSummary } from './GotyBolaoTab';
import { GotyPersonalTab } from './GotyPersonalTab';
import { GotyButton, GotyFeedbackProvider, GotySegmented } from './GotyUi';
import { TgaEmblem } from './TgaEmblem';

const DOCK_HEIGHT = 74;

export function GotyExperience() {
  const { userId, isAdmin } = useApp();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const query = useGotyState();
  const state = query.data;
  useGotyAutoResolveCovers(state);

  const [activeTab, setActiveTab] = useState<GotyTab>(() => parseGotyTab(params.tab));
  const [seenTabParam, setSeenTabParam] = useState(params.tab);
  const [selectedBolaoView, setBolaoView] = useState<BolaoView>('ballot');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);

  // Deep link / navegação com ?tab=bolao|seu-goty depois que a tela já está montada.
  if (seenTabParam !== params.tab) {
    setSeenTabParam(params.tab);
    if (params.tab !== undefined) setActiveTab(parseGotyTab(params.tab));
  }

  // Um admin que perde o papel volta para a votação.
  const bolaoView: BolaoView = !isAdmin && selectedBolaoView === 'admin' ? 'ballot' : selectedBolaoView;

  const handleTabChange = useCallback((next: GotyTab) => {
    setActiveTab(next);
    router.setParams({ tab: next });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [router]);

  const scrollToNode = useCallback((node: View | null) => {
    const content = contentRef.current;
    if (!node || !content) return;
    node.measureLayout(
      content,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }),
      () => undefined,
    );
  }, []);

  const onRefresh = useCallback(async () => {
    setManualRefresh(true);
    try {
      await query.refetch();
    } finally {
      setManualRefresh(false);
    }
  }, [query]);

  const showDock = Boolean(state && userId && activeTab === 'bolao' && bolaoView === 'ballot');
  const sourceUrl = state?.event.source_url || GOTY_2026_SOURCE.url;

  return (
    <GotyFeedbackProvider bottomOffset={showDock ? DOCK_HEIGHT + insets.bottom : insets.bottom}>
      <View style={styles.stage}>
        {/* O cabeçalho da tela é sempre escuro, mesmo com tema claro no app. */}
        <StatusBar style="light" />
        <View style={styles.spotlight} pointerEvents="none" />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: (showDock ? DOCK_HEIGHT : 0) + insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={(
            <RefreshControl
              refreshing={manualRefresh}
              onRefresh={() => void onRefresh()}
              tintColor={gotyColors.goldStrong}
              colors={[gotyColors.goldStrong]}
              progressBackgroundColor={gotyColors.surface}
            />
          )}
        >
          <View ref={contentRef} collapsable={false} style={styles.content}>
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View style={styles.emblemBox}>
                  <TgaEmblem size={38} />
                </View>
                <View style={styles.flex1}>
                  <View style={styles.headerMeta}>
                    <View style={styles.specialPill}>
                      <Text style={styles.specialPillText}>Evento especial</Text>
                    </View>
                    <View style={styles.dateRow}>
                      <Ionicons name="calendar" size={13} color="#d7b458" />
                      <Text style={styles.dateText}>{formatCeremonyDate(state?.event.ceremony_at ?? GOTY_2026_SOURCE.ceremonyAt)}</Text>
                    </View>
                  </View>
                  <Text style={styles.title} accessibilityRole="header">GOTY 2026</Text>
                </View>
              </View>
              <Text style={styles.subtitle}>
                Participe do Bolão oficial com as {state?.categories.length ?? 30} categorias do The Game Awards 2026 e celebre os jogos que marcaram o seu ano no mural coletivo do clube.
              </Text>
              <Pressable
                onPress={() => void Linking.openURL(sourceUrl)}
                accessibilityRole="link"
                accessibilityLabel="Abrir a fonte oficial dos indicados do The Game Awards 2026"
                style={({ pressed }) => [styles.sourceLink, pressed && gotyShared.pressed]}
              >
                <Text style={styles.sourceText}>Fonte oficial TGA 2026</Text>
                <Ionicons name="open-outline" size={12} color="#dcc790" />
              </Pressable>
            </View>

            {query.isPending ? (
              <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Carregando GOTY 2026">
                <ActivityIndicator color={gotyColors.goldStrong} size="large" />
                <Text style={styles.loadingText}>Preparando a noite de gala…</Text>
              </View>
            ) : query.isError && !state ? (
              <View style={styles.error} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={28} color={gotyColors.red} />
                <Text style={styles.errorText}>{query.error.message}</Text>
                <GotyButton label="Tentar novamente" variant="danger" icon="refresh" onPress={() => void query.refetch()} />
              </View>
            ) : state && userId ? (
              <View style={styles.body}>
                <GotySegmented
                  size="lg"
                  accessibilityLabel="Seções do GOTY 2026"
                  value={activeTab}
                  onChange={handleTabChange}
                  options={[
                    { value: 'bolao', label: 'Bolão GOTY', icon: 'trophy' },
                    { value: 'seu-goty', label: 'Seu GOTY', icon: 'heart' },
                  ]}
                />
                {activeTab === 'bolao' ? (
                  <GotyBolaoTab
                    state={state}
                    userId={userId}
                    isAdmin={isAdmin}
                    view={bolaoView}
                    onViewChange={setBolaoView}
                    reviewOpen={reviewOpen}
                    onReviewOpenChange={setReviewOpen}
                    scrollToNode={scrollToNode}
                  />
                ) : (
                  <GotyPersonalTab state={state} userId={userId} />
                )}
              </View>
            ) : null}
          </View>
        </ScrollView>

        {showDock && state && userId ? (
          <DockContainer state={state} userId={userId} bottomInset={insets.bottom} onReview={() => setReviewOpen(true)} />
        ) : null}
      </View>
    </GotyFeedbackProvider>
  );
}

function DockContainer({
  state,
  userId,
  bottomInset,
  onReview,
}: {
  state: NonNullable<ReturnType<typeof useGotyState>['data']>;
  userId: string;
  bottomInset: number;
  onReview: () => void;
}) {
  const { progress, isConfirmed, votingOpen } = useBolaoSummary(state, userId);
  const announcedCount = useMemo(
    () => state.categories.filter(category => Boolean(category.winner_nominee_id)).length,
    [state.categories],
  );
  const correctCount = useMemo(() => {
    if (announcedCount === 0) return null;
    const board = computeBolaoLeaderboard(state.categories, state.bolaoVotes, state.bolaoSubmissions, state.profiles);
    return board.find(entry => entry.user_id === userId)?.correctCount ?? null;
  }, [announcedCount, state, userId]);
  return (
    <GotyBolaoDock
      progress={progress}
      isConfirmed={isConfirmed}
      votingOpen={votingOpen}
      correctCount={correctCount}
      announcedCount={announcedCount}
      onReview={onReview}
      bottomInset={bottomInset}
    />
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: gotyColors.stage },
  spotlight: {
    position: 'absolute',
    top: -220,
    alignSelf: 'center',
    width: 520,
    height: 420,
    borderRadius: 260,
    backgroundColor: 'rgba(223,180,81,0.1)',
  },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14 },
  flex1: { flex: 1, minWidth: 0 },
  header: {
    gap: 10,
    paddingBottom: 18,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(223,192,108,0.18)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emblemBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(240,207,114,0.45)',
    backgroundColor: '#1a150c',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  specialPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(229,195,105,0.4)',
    backgroundColor: 'rgba(223,192,108,0.14)',
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  specialPillText: { color: gotyColors.goldPale, fontSize: 9, fontWeight: '900', letterSpacing: 1.6, textTransform: 'uppercase' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { color: '#a99c7f', fontSize: 11, fontWeight: '700' },
  title: { color: '#f1d483', fontSize: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  subtitle: { color: '#b9ae92', fontSize: 13, lineHeight: 19 },
  sourceLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(223,192,108,0.25)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sourceText: { color: '#dcc790', fontSize: 11, fontWeight: '700' },
  body: { gap: 16 },
  loading: { alignItems: 'center', gap: 12, paddingVertical: 64 },
  loadingText: { color: gotyColors.textMuted, fontSize: 13, fontWeight: '700' },
  error: {
    alignItems: 'center',
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: gotyColors.redBorder,
    backgroundColor: 'rgba(69,10,10,0.2)',
    padding: 24,
  },
  errorText: { color: gotyColors.redText, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
