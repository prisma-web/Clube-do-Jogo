import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useApp } from '@/state/app-provider';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const colors = useThemeColors();
  const styles = useStyles();
  const { signIn, signUp, enterDemo, error } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [enteringDemo, setEnteringDemo] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');

  async function submit() {
    setSubmitting(true);
    setFormError('');
    setMessage('');
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp(name.trim(), email.trim(), password);
        setMessage('Cadastro feito! Confira seu e-mail para confirmar a conta.');
      }
    } catch (value) {
      setFormError(value instanceof Error ? value.message : 'Não foi possível autenticar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function startDemo() {
    setEnteringDemo(true);
    setFormError('');
    try {
      await enterDemo();
    } catch (value) {
      setFormError(value instanceof Error ? value.message : 'Não foi possível entrar no modo demonstração.');
    } finally {
      setEnteringDemo(false);
    }
  }

  const busy = submitting || enteringDemo;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="game-controller" size={30} color={colors.white} />
          </View>
          <Text style={styles.brandTitle}>Clube do Jogo</Text>
          <Text style={styles.brandSubtitle}>Um jogo por mês. Muitas histórias para compartilhar.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{mode === 'login' ? 'Boas-vindas de volta' : 'Entre para o clube'}</Text>
          <Text style={styles.cardSubtitle}>{mode === 'login' ? 'Continue de onde você parou.' : 'Crie sua conta para votar e participar.'}</Text>

          {(formError || error || message) ? (
            <View style={[styles.notice, (formError || error) ? styles.noticeError : styles.noticeSuccess]} accessibilityRole="alert">
              <Text style={(formError || error) ? styles.noticeErrorText : styles.noticeSuccessText}>{formError || error || message}</Text>
            </View>
          ) : null}

          <View style={styles.form}>
            {mode === 'signup' ? (
              <View style={styles.field}>
                <Ionicons name="person-outline" size={16} color={colors.zinc600} style={styles.fieldIcon} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Seu nome"
                  placeholderTextColor={colors.zinc600}
                  textContentType="name"
                  autoComplete="name"
                  style={styles.input}
                  accessibilityLabel="Seu nome"
                />
              </View>
            ) : null}
            <View style={styles.field}>
              <Ionicons name="mail-outline" size={16} color={colors.zinc600} style={styles.fieldIcon} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Seu e-mail"
                placeholderTextColor={colors.zinc600}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                style={styles.input}
                accessibilityLabel="Seu e-mail"
              />
            </View>
            <View style={styles.field}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.zinc600} style={styles.fieldIcon} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Sua senha"
                placeholderTextColor={colors.zinc600}
                secureTextEntry
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={styles.input}
                accessibilityLabel="Sua senha"
              />
            </View>
            <Button
              label={submitting ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
              onPress={submit}
              loading={submitting}
              disabled={busy || !email.trim() || !password || (mode === 'signup' && !name.trim())}
            />
          </View>

          <Pressable
            onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setFormError(''); setMessage(''); }}
            accessibilityRole="button"
            style={styles.switchMode}
          >
            <Text style={styles.switchModeText}>{mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}</Text>
          </Pressable>
        </View>

        <Pressable onPress={startDemo} disabled={busy} accessibilityRole="button" accessibilityLabel="Entrar no modo demonstração" style={styles.demoButton}>
          <Ionicons name="sparkles-outline" size={16} color={colors.violet300} />
          <Text style={styles.demoButtonText}>{enteringDemo ? 'Entrando…' : 'Explorar no modo demonstração'}</Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const useStyles = themedStyles(colors => ({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.xl },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.violet600,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  brandTitle: { ...typography.h1, color: colors.foreground },
  brandSubtitle: { ...typography.small, color: colors.zinc400, textAlign: 'center', maxWidth: 260 },
  card: {
    borderRadius: radii.xxxl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardTitle: { ...typography.h2, color: colors.foreground },
  cardSubtitle: { ...typography.small, color: colors.zinc500 },
  notice: { borderRadius: radii.md, borderWidth: 1, padding: spacing.md },
  noticeError: { borderColor: 'rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.1)' },
  noticeSuccess: { borderColor: 'rgba(16,185,129,0.2)', backgroundColor: 'rgba(16,185,129,0.1)' },
  noticeErrorText: { color: colors.red300, fontSize: 12, fontWeight: '600' },
  noticeSuccessText: { color: colors.emerald300, fontSize: 12, fontWeight: '600' },
  form: { gap: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceDeep,
    paddingHorizontal: spacing.md,
  },
  fieldIcon: { marginRight: spacing.sm },
  input: { flex: 1, color: colors.foreground, fontSize: 14 },
  switchMode: { alignItems: 'center', paddingTop: spacing.sm },
  switchModeText: { color: colors.violet300, fontSize: 12, fontWeight: '800' },
  demoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 48 },
  demoButtonText: { color: colors.violet300, fontSize: 13, fontWeight: '800' },
}));
