import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, themedStyles, useNativeTheme } from '@/theme';
import { useGotyBadgeClearance } from '@/features/goty/GotyFloatingBadge';

const SCROLL_BOTTOM_PADDING = spacing.xxxl * 2;

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
  const badgeClearance = useGotyBadgeClearance();
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
        {/* A folga inferior só vale no ramo rolável: em scroll={false} ela viraria espaço morto
            fixo e cortaria a lista. Ela cresce para o fim do conteúdo sair de baixo do badge GOTY. */}
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(SCROLL_BOTTOM_PADDING, badgeClearance) }, contentContainerStyle as object]}
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
}));
