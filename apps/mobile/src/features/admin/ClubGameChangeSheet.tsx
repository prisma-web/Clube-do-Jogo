import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ClubGameChangePreview, ClubGameChangeResult } from '@clube-do-jogo/data';
import { gameCoverUrl, type Game } from '@clube-do-jogo/domain';
import { formatMonth } from '@/lib/format';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { EmptyState } from '@/components/StateViews';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGame } from '@/state/queries';
import { useAdminGameOptions, usePreviewClubGameChange, useSetClubGame, type SetClubGameVariables } from '@/state/admin-queries';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { initialPhaseFor, type ClubGameChangePhase as Phase } from './club-game-change-phase';

export function ClubGameChangeSheet({ visible, initialGame, onClose, onApplied }: {
  visible: boolean;
  initialGame?: Game;
  onClose: () => void;
  onApplied: (result: ClubGameChangeResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>(() => initialPhaseFor(initialGame));
  const setClubGame = useSetClubGame();
  const committing = phase.step === 'confirm' && setClubGame.isPending;

  const title = phase.step === 'pick-game' ? 'Escolher jogo do clube'
    : phase.step === 'choose-mode' ? phase.game.title
      : 'Confirmar decisão';

  const guardedClose = () => {
    if (committing) return;
    onClose();
  };

  return (
    <Sheet visible={visible} title={title} onClose={guardedClose} avoidKeyboard={phase.step === 'pick-game'}>
      {phase.step === 'pick-game' ? (
        <GamePicker onSelect={game => setPhase({ step: 'choose-mode', game })} />
      ) : phase.step === 'choose-mode' ? (
        <ModeChoice
          game={phase.game}
          onBack={() => setPhase({ step: 'pick-game' })}
          onPreviewed={preview => setPhase({ step: 'confirm', game: phase.game, preview })}
        />
      ) : (
        <ConfirmChange
          game={phase.game}
          preview={phase.preview}
          setClubGame={setClubGame}
          onBack={() => setPhase({ step: 'choose-mode', game: phase.game })}
          onApplied={result => {
            onApplied(result);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function GamePicker({ onSelect }: { onSelect: (game: Game) => void }) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 350);
  const catalog = useAdminGameOptions(debouncedQuery);
  const results = catalog.data || [];

  return (
    <View style={styles.pickerBody}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar jogo…"
        placeholderTextColor={colors.zinc600}
        style={styles.search}
        accessibilityLabel="Buscar jogo do clube"
        testID="admin-club-game-search"
        returnKeyType="search"
      />
      <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
        {catalog.isLoading ? (
          <ActivityIndicator color={colors.violet400} style={styles.pickerLoading} />
        ) : catalog.isError ? (
          <Text style={styles.error}>{catalog.error.message}</Text>
        ) : results.length === 0 ? (
          <EmptyState icon="game-controller-outline" title="Nenhum jogo encontrado" description="Busque por outro título." />
        ) : (
          results.map(item => (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={`Selecionar ${item.title} como jogo do clube`}
              testID={`admin-club-game-${item.id}`}
              style={({ pressed }) => [styles.gameRow, pressed && styles.gameRowPressed]}
            >
              <Image source={{ uri: gameCoverUrl(item.image_url) }} style={styles.gameCover} contentFit="cover" />
              <Text style={styles.gameTitle} numberOfLines={2}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.zinc600} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ModeChoice({ game, onBack, onPreviewed }: {
  game: Game;
  onBack: () => void;
  onPreviewed: (preview: ClubGameChangePreview) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const previewChange = usePreviewClubGameChange();

  return (
    <View style={styles.modeBody}>
      <View style={styles.selectedGameRow}>
        <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.gameCover} contentFit="cover" />
        <Text style={styles.selectedGameTitle} numberOfLines={2}>{game.title}</Text>
      </View>

      <ChoiceButton
        icon="refresh-outline"
        title="Definir para o ciclo atual"
        description="Substitui o jogo do ciclo em andamento por este, se houver um ciclo ativo."
        loading={previewChange.isPending && previewChange.variables?.mode === 'current'}
        disabled={previewChange.isPending}
        onPress={() => previewChange.mutate({ gameId: game.id, mode: 'current' }, { onSuccess: onPreviewed })}
        testID="admin-club-mode-current"
      />
      <ChoiceButton
        icon="calendar-outline"
        title="Avançar para o próximo ciclo"
        description="Encerra o ciclo atual, se houver, e inicia um novo ciclo com este jogo."
        loading={previewChange.isPending && previewChange.variables?.mode === 'next'}
        disabled={previewChange.isPending}
        onPress={() => previewChange.mutate({ gameId: game.id, mode: 'next' }, { onSuccess: onPreviewed })}
        testID="admin-club-mode-next"
      />

      {previewChange.isError ? (
        <Text style={styles.error} accessibilityRole="alert">{previewChange.error.message}</Text>
      ) : null}

      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Voltar para a busca" style={styles.backLink}>
        <Ionicons name="arrow-back" size={14} color={colors.zinc400} />
        <Text style={styles.backLinkText}>Escolher outro jogo</Text>
      </Pressable>
    </View>
  );
}

function ChoiceButton({ icon, title, description, loading, disabled, onPress, testID }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [styles.choice, disabled && styles.choiceDisabled, pressed && !disabled && styles.choicePressed]}
    >
      <View style={styles.choiceIcon}>
        {loading ? <ActivityIndicator color={colors.amber400} size="small" /> : <Ionicons name={icon} size={18} color={colors.amber400} />}
      </View>
      <View style={styles.choiceTexts}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDescription}>{description}</Text>
      </View>
    </Pressable>
  );
}

function ConfirmChange({ game, preview, setClubGame, onBack, onApplied }: {
  game: Game;
  preview: ClubGameChangePreview;
  setClubGame: UseMutationResult<ClubGameChangeResult, Error, SetClubGameVariables>;
  onBack: () => void;
  onApplied: (result: ClubGameChangeResult) => void;
}) {
  const styles = useStyles();
  const currentGameQuery = useGame(preview.activeCycle?.gameId || '');

  const currentGameTitle = currentGameQuery.data?.title;
  const summary = preview.mode === 'next'
    ? preview.activeCycle
      ? `O ciclo de ${formatMonth(preview.activeCycle.month)} será encerrado. O ciclo de ${formatMonth(preview.targetMonth)} começa com ${game.title}.`
      : `O ciclo de ${formatMonth(preview.targetMonth)} começa com ${game.title}.`
    : preview.activeCycle
      ? `O jogo de ${formatMonth(preview.activeCycle.month)} será ${game.title}.${currentGameTitle && currentGameTitle !== game.title ? ` ${currentGameTitle} será substituído.` : ''} Os comentários atuais deste ciclo serão perdidos.`
      : `${game.title} será o jogo deste ciclo.`;

  return (
    <ScrollView contentContainerStyle={styles.confirmBody} keyboardShouldPersistTaps="handled">
      <View style={styles.selectedGameRow}>
        <Image source={{ uri: gameCoverUrl(game.image_url) }} style={styles.gameCover} contentFit="cover" />
        <Text style={styles.selectedGameTitle} numberOfLines={2}>{game.title}</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryCardText}>{summary}</Text>
      </View>

      {setClubGame.isError ? (
        <View style={styles.errorCard} accessibilityRole="alert">
          <Text style={styles.error}>{setClubGame.error.message}</Text>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Voltar e atualizar prévia">
            <Text style={styles.backLinkText}>Voltar e atualizar prévia</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.confirmActions}>
        <Button label="Voltar" variant="secondary" disabled={setClubGame.isPending} onPress={onBack} style={styles.confirmActionButton} />
        <Button
          label="Confirmar"
          variant="primary"
          loading={setClubGame.isPending}
          accessibilityLabel="Confirmar decisão de ciclo"
          style={styles.confirmActionButton}
          onPress={() => setClubGame.mutate({ preview }, { onSuccess: onApplied })}
        />
      </View>
    </ScrollView>
  );
}

const useStyles = themedStyles(colors => ({
  pickerBody: { padding: spacing.lg, gap: spacing.md, maxHeight: '100%' },
  search: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 14,
  },
  pickerList: { gap: spacing.sm },
  pickerLoading: { marginTop: spacing.lg },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    backgroundColor: colors.surfaceSofter,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  gameRowPressed: { opacity: 0.8 },
  gameCover: { width: 40, height: 54, borderRadius: radii.sm, backgroundColor: colors.zinc900 },
  gameTitle: { flex: 1, ...typography.small, color: colors.foreground, fontWeight: '700' },
  modeBody: { padding: spacing.lg, gap: spacing.md },
  selectedGameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selectedGameTitle: { flex: 1, ...typography.h3, color: colors.foreground },
  choice: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    backgroundColor: 'rgba(251,191,36,0.06)',
    padding: spacing.md,
  },
  choicePressed: { opacity: 0.85 },
  choiceDisabled: { opacity: 0.6 },
  choiceIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(251,191,36,0.12)' },
  choiceTexts: { flex: 1, gap: 4 },
  choiceTitle: { ...typography.small, color: colors.foreground, fontWeight: '800' },
  choiceDescription: { ...typography.tiny, color: colors.amber200, textTransform: 'none', lineHeight: 15 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: spacing.sm },
  backLinkText: { ...typography.small, color: colors.violet300, fontWeight: '700' },
  confirmBody: { padding: spacing.lg, gap: spacing.md },
  summaryCard: { borderRadius: radii.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surfaceDeep, padding: spacing.md },
  summaryCardText: { ...typography.small, color: colors.zinc300, lineHeight: 18 },
  errorCard: { gap: spacing.xs },
  error: { ...typography.small, color: colors.red300, lineHeight: 16 },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
  confirmActionButton: { flex: 1 },
}));
