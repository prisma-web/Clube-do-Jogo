import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { radii, spacing, themedStyles, typography } from '@/theme';
import { formatSemver } from './release';
import type { UpdateFlow } from './update-flow';

type ShownFlow = Exclude<UpdateFlow, { phase: 'idle' }>;

export function AppUpdateSheet({ flow, onAccept, onDismiss }: {
  flow: UpdateFlow;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const [lastShown, setLastShown] = useState<ShownFlow | null>(null);
  if (flow.phase !== 'idle' && flow !== lastShown) setLastShown(flow);
  const shown = flow.phase === 'idle' ? lastShown : flow;
  if (!shown) return null;

  const { installed, release } = shown.update;
  const busy = shown.phase === 'downloading' || shown.phase === 'installing';

  return (
    <Sheet visible={flow.phase !== 'idle'} title="Atualização do app" onClose={onDismiss}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">Versão {formatSemver(release.version)} disponível</Text>
        <Text style={styles.description}>
          Você está na {formatSemver(installed)}. A atualização baixa a nova versão e abre o instalador do Android.
        </Text>
        {release.notes ? (
          <>
            <Text style={styles.eyebrow}>Novidades</Text>
            <Text style={styles.notes}>{release.notes}</Text>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {shown.phase === 'available' ? (
          <Text style={styles.hint}>Na primeira vez, o Android pede para permitir que o Clube do Jogo instale apps.</Text>
        ) : null}
        {shown.phase === 'downloading' ? (
          <View style={styles.progress}>
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityLabel="Baixando atualização"
              accessibilityValue={{ min: 0, max: 100, now: shown.percent }}
            >
              <View style={[styles.fill, { width: `${shown.percent}%` }]} />
            </View>
            <Text style={styles.hint}>Baixando… {shown.percent}%</Text>
          </View>
        ) : null}
        {shown.phase === 'installing' ? <Text style={styles.hint}>Abrindo o instalador do Android…</Text> : null}
        {shown.phase === 'error' ? (
          <Text style={styles.error}>Não deu para baixar a atualização. Confira sua conexão e tente de novo.</Text>
        ) : null}
        <View style={styles.actions}>
          <Button
            label={shown.phase === 'downloading' ? 'Cancelar' : 'Depois'}
            variant="ghost"
            onPress={onDismiss}
            style={styles.actionButton}
          />
          <Button
            label={shown.phase === 'error' ? 'Tentar de novo' : 'Atualizar'}
            variant="primary"
            onPress={onAccept}
            loading={busy}
            accessibilityLabel={busy ? 'Atualizando' : undefined}
            style={styles.actionButton}
          />
        </View>
      </View>
    </Sheet>
  );
}

const useStyles = themedStyles(colors => ({
  scroll: { flexShrink: 1 },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { ...typography.h2, color: colors.foreground },
  description: { ...typography.body, color: colors.zinc400, lineHeight: 20 },
  eyebrow: { ...typography.tiny, color: colors.violet300, marginTop: spacing.md },
  notes: { ...typography.small, color: colors.zinc300, lineHeight: 17 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  hint: { ...typography.small, color: colors.zinc500, lineHeight: 17 },
  error: { ...typography.small, color: colors.red300, lineHeight: 17 },
  progress: { gap: spacing.sm },
  track: { height: 6, borderRadius: radii.full, backgroundColor: colors.hairline, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.full, backgroundColor: colors.violet400 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
