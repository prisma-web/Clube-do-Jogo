import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, themedStyles, useNativeTheme } from '@/theme';

export function Screen({ children, scroll = true, contentContainerStyle, onRefresh, refreshing, edges }: {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
}) {
  const theme = useNativeTheme();
  const styles = useStyles();
  // Com uma cena de tema ativa o fundo fica transparente para revelar o cenário montado
  // atrás da navegação; sem cena o fundo continua opaco.
  const safeArea = [styles.safeArea, theme.scene !== 'none' && styles.safeAreaScenic];

  if (!scroll) {
    return (
      <SafeAreaView style={safeArea} edges={edges ?? ['top']}>
        <View style={[styles.content, contentContainerStyle as object]}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={safeArea} edges={edges ?? ['top']}>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior="height" enabled={Platform.OS === 'android'}>
        <ScrollView
          contentContainerStyle={[styles.content, styles.scrollContent, contentContainerStyle as object]}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.violet400} /> : undefined}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = themedStyles(colors => ({
  keyboardArea: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  safeAreaScenic: { backgroundColor: 'transparent' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, flexGrow: 1 },
  // Só no ramo rolável: em scroll={false} esta folga vira espaço morto fixo e corta a lista.
  scrollContent: { paddingBottom: spacing.xxxl * 2 },
}));
