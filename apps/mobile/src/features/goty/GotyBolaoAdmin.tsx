import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GotyCategory, GotyFullState } from '@clube-do-jogo/domain';
import { useSetGotyCategoryWinner, useSyncGotyCovers, useUpdateGotyEvent } from '@/state/goty-queries';
import {
  categoryMatchesSearch,
  EVENT_STATUS_OPTIONS,
  formatDateTimePt,
  formatDeadlineInput,
  normalizeSearchText,
  parseDeadlineInput,
  type GotyEventPatch,
} from './goty-logic';
import { gotyColors, gotyShared } from './goty-theme';
import { errorMessage, GotyButton, GotySheet, useGotyNotify } from './GotyUi';

export function GotyBolaoAdmin({ state, announcedCount }: { state: GotyFullState; announcedCount: number }) {
  const notify = useGotyNotify();
  const updateEvent = useUpdateGotyEvent();
  const setWinner = useSetGotyCategoryWinner();
  const syncCovers = useSyncGotyCovers();
  const [categorySearch, setCategorySearch] = useState('');
  const [deadlineDraft, setDeadlineDraft] = useState(() => formatDeadlineInput(state.event.voting_closes_at));
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [winnerCategory, setWinnerCategory] = useState<GotyCategory | null>(null);
  const [syncedDeadline, setSyncedDeadline] = useState(state.event.voting_closes_at);

  if (syncedDeadline !== state.event.voting_closes_at) {
    setSyncedDeadline(state.event.voting_closes_at);
    setDeadlineDraft(formatDeadlineInput(state.event.voting_closes_at));
    setDeadlineError(null);
  }

  const filteredCategories = useMemo(() => {
    const needle = normalizeSearchText(categorySearch);
    return needle ? state.categories.filter(category => categoryMatchesSearch(category, needle)) : state.categories;
  }, [categorySearch, state.categories]);

  async function applyPatch(patch: GotyEventPatch) {
    try {
      await updateEvent.mutateAsync(patch);
      notify('Configuração do evento atualizada');
    } catch (error) {
      notify(errorMessage(error, 'Não foi possível atualizar o estado do evento.'), 'error');
    }
  }

  function saveDeadline(text: string) {
    const parsed = parseDeadlineInput(text);
    if (!parsed.ok) {
      setDeadlineError(parsed.error);
      return;
    }
    setDeadlineError(null);
    void applyPatch({ votingClosesAt: parsed.iso });
  }

  async function chooseWinner(category: GotyCategory, winnerNomineeId: string | null) {
    setWinnerCategory(null);
    try {
      await setWinner.mutateAsync({ categoryId: category.id, winnerNomineeId });
      notify(winnerNomineeId ? 'Vencedor oficial registrado!' : 'Vencedor removido');
    } catch (error) {
      notify(errorMessage(error, 'Não foi possível salvar o vencedor oficial da categoria.'), 'error');
    }
  }

  async function handleSyncCovers() {
    try {
      const result = await syncCovers.mutateAsync();
      if (result.demo) {
        notify('No modo demo os cartazes editoriais dourados estão ativos', 'info');
        return;
      }
      notify(result.updated > 0
        ? `${result.updated} capas atualizadas com sucesso`
        : 'Todas as capas disponíveis já estão sincronizadas');
    } catch (error) {
      notify(errorMessage(error, 'Não foi possível atualizar as capas.'), 'error');
    }
  }

  return (
    <View style={styles.stack}>
      <View style={[gotyShared.card, styles.controlCard]}>
        <View style={styles.rowGap}>
          <Ionicons name="shield-checkmark" size={13} color={gotyColors.goldStrong} />
          <Text style={gotyShared.eyebrow}>Controle administrativo · GOTY 2026</Text>
        </View>
        <Text style={styles.title}>Abertura, encerramento e apuração oficial</Text>
        <Text style={styles.text}>
          Controle quando o Bolão aceita palpites e registre os vencedores oficiais após a cerimônia. O placar do clube atualiza automaticamente.
        </Text>
        <GotyButton
          label={syncCovers.isPending ? 'Buscando capas…' : 'Sincronizar capas via IGDB'}
          icon="refresh"
          variant="ghost"
          loading={syncCovers.isPending}
          onPress={() => void handleSyncCovers()}
          style={styles.alignStart}
        />

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Status do Bolão GOTY</Text>
          <View style={styles.statusRow}>
            {EVENT_STATUS_OPTIONS.map(option => {
              const active = state.event.status === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => { if (!active) void applyPatch({ status: option.value }); }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={({ pressed }) => [styles.statusOption, active && styles.statusOptionActive, pressed && gotyShared.pressed]}
                >
                  <Text style={[styles.statusLabel, active && styles.statusLabelActive]}>{option.label}</Text>
                  <Text style={[styles.statusDesc, active && styles.statusLabelActive]}>{option.desc}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Prazo limite do Bolão (voting_closes_at)</Text>
          <Text style={styles.panelHint}>Atual: {formatDateTimePt(state.event.voting_closes_at)} · horário deste aparelho</Text>
          <TextInput
            value={deadlineDraft}
            onChangeText={text => {
              setDeadlineDraft(text);
              if (deadlineError) setDeadlineError(null);
            }}
            placeholder="DD/MM/AAAA HH:mm"
            placeholderTextColor={gotyColors.textFaint}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            style={[styles.input, deadlineError ? styles.inputError : null]}
            accessibilityLabel="Prazo limite do Bolão no formato dia, mês, ano, hora e minuto"
            onSubmitEditing={() => saveDeadline(deadlineDraft)}
          />
          {deadlineError ? <Text style={styles.errorText}>{deadlineError}</Text> : null}
          <View style={styles.rowGap}>
            <GotyButton label="Salvar prazo" icon="save" onPress={() => saveDeadline(deadlineDraft)} style={styles.flex1} />
            <GotyButton
              label="Sem prazo"
              variant="quiet"
              disabled={!state.event.voting_closes_at}
              onPress={() => {
                setDeadlineDraft('');
                saveDeadline('');
              }}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Permitir edições no “Seu GOTY” (independente do Bolão)</Text>
            <Switch
              value={state.event.personal_voting_open}
              onValueChange={value => void applyPatch({ personalVotingOpen: value })}
              trackColor={{ false: '#3f3a2e', true: '#b8913a' }}
              thumbColor={state.event.personal_voting_open ? '#f4df9a' : '#a79c82'}
              accessibilityLabel="Permitir edições no Seu GOTY"
            />
          </View>
        </View>
      </View>

      <View style={gotyShared.card}>
        <Text style={styles.winnersTitle}>Registrar vencedores oficiais ({announcedCount}/{state.categories.length})</Text>
        <Text style={styles.text}>
          Toque em uma categoria para definir o vencedor oficial. Você pode registrar aos poucos ou após a cerimônia.
        </Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={14} color="#9d8f70" />
          <TextInput
            value={categorySearch}
            onChangeText={setCategorySearch}
            placeholder="Filtrar categoria…"
            placeholderTextColor={gotyColors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
            accessibilityLabel="Filtrar categoria"
          />
        </View>
        <View style={styles.winnerList}>
          {filteredCategories.map(category => {
            const winner = category.nominees.find(nominee => nominee.id === category.winner_nominee_id) ?? null;
            return (
              <Pressable
                key={category.id}
                onPress={() => setWinnerCategory(category)}
                accessibilityRole="button"
                accessibilityLabel={`Vencedor oficial de ${category.name_pt}: ${winner ? winner.title : 'ainda não definido'}`}
                style={({ pressed }) => [styles.winnerRow, pressed && gotyShared.pressed]}
              >
                <View style={styles.flex1}>
                  <Text style={styles.winnerCategory} numberOfLines={1}>#{category.display_order} · {category.name}</Text>
                  <Text style={styles.winnerName} numberOfLines={1}>{category.name_pt}</Text>
                  <Text style={[styles.winnerValue, !winner && styles.winnerUnset]} numberOfLines={1}>
                    {winner ? winner.title : '— Ainda não definido —'}
                  </Text>
                </View>
                {winner ? (
                  <View style={styles.winnerCheck}>
                    <Ionicons name="checkmark" size={16} color={gotyColors.emerald} />
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={gotyColors.textSubtle} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <GotySheet
        visible={Boolean(winnerCategory)}
        onClose={() => setWinnerCategory(null)}
        title={winnerCategory ? `Vencedor · ${winnerCategory.name_pt}` : 'Vencedor oficial'}
        description={winnerCategory?.name}
      >
        {winnerCategory ? (
          <ScrollView contentContainerStyle={styles.sheetList}>
            <WinnerOption
              label="— Ainda não definido —"
              active={!winnerCategory.winner_nominee_id}
              onPress={() => void chooseWinner(winnerCategory, null)}
            />
            {winnerCategory.nominees.map(nominee => (
              <WinnerOption
                key={nominee.id}
                label={nominee.title}
                subtitle={nominee.subtitle}
                active={winnerCategory.winner_nominee_id === nominee.id}
                onPress={() => void chooseWinner(winnerCategory, nominee.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </GotySheet>
    </View>
  );
}

function WinnerOption({ label, subtitle, active, onPress }: { label: string; subtitle?: string | null; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && gotyShared.pressed]}
    >
      <View style={styles.flex1}>
        <Text style={styles.optionLabel}>{label}</Text>
        {subtitle ? <Text style={styles.optionSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? gotyColors.goldBright : gotyColors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  flex1: { flex: 1, minWidth: 0 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  alignStart: { alignSelf: 'flex-start' },
  controlCard: { borderColor: 'rgba(223,192,108,0.3)', gap: 10 },
  title: { color: gotyColors.textStrong, fontSize: 17, fontWeight: '900' },
  text: { color: '#a89c7f', fontSize: 12, lineHeight: 17 },
  panel: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
  },
  panelLabel: { color: '#b8aa8c', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  panelHint: { color: gotyColors.textSubtle, fontSize: 11 },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusOption: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 9,
  },
  statusOptionActive: { borderColor: '#e8c66d', backgroundColor: 'rgba(223,192,108,0.2)' },
  statusLabel: { color: '#a79c82', fontSize: 12, fontWeight: '900' },
  statusLabelActive: { color: '#fff8e4' },
  statusDesc: { color: '#a79c82', fontSize: 10, opacity: 0.85, marginTop: 2 },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: gotyColors.hairlineStrong,
    backgroundColor: '#16151e',
    color: '#faf4e4',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    fontVariant: ['tabular-nums'],
  },
  inputError: { borderColor: gotyColors.red },
  errorText: { color: gotyColors.redText, fontSize: 11, fontWeight: '600' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  switchLabel: { flex: 1, color: '#e7dcc0', fontSize: 12, fontWeight: '700' },
  winnersTitle: { color: gotyColors.textStrong, fontSize: 15, fontWeight: '900', marginBottom: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: '#15141c',
    paddingHorizontal: 12,
    marginTop: 12,
  },
  searchInput: { flex: 1, color: '#faf4e4', fontSize: 13, paddingVertical: 8 },
  winnerList: { gap: 8, marginTop: 12 },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: gotyColors.surfaceRow,
    padding: 12,
  },
  winnerCategory: { color: '#c7b483', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  winnerName: { color: '#faf4e4', fontSize: 14, fontWeight: '800', marginTop: 2 },
  winnerValue: { color: gotyColors.goldText, fontSize: 12, fontWeight: '700', marginTop: 3 },
  winnerUnset: { color: gotyColors.textSubtle, fontWeight: '600' },
  winnerCheck: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: gotyColors.emeraldTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetList: { padding: 14, gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: gotyColors.hairline,
    backgroundColor: gotyColors.surfaceRow,
    padding: 12,
  },
  optionActive: { borderColor: gotyColors.goldBorderStrong, backgroundColor: '#1d180d' },
  optionLabel: { color: '#faf4e4', fontSize: 14, fontWeight: '800' },
  optionSubtitle: { color: gotyColors.textSubtle, fontSize: 11, marginTop: 2 },
});
