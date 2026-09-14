import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  usePathname,
  useRouter,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/state/app-provider';
import { NotificationBridge } from '@/state/notification-bridge';
import {
  clearNavIntent,
  consumeNavIntent,
  decideRootNavigation,
  DEFAULT_APP_ROUTE,
  AUTHENTICATED_INTENT_NAVIGATION_OPTIONS,
  peekNavIntent,
} from '@/lib/nav-intent';
import { ThemeBackdrop, ThemeSceneProvider } from '@/features/themes';
import { ThemeProvider, useNativeTheme } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppProvider>
          <NotificationBridge>
            <ThemeProvider>
              <ThemeSceneProvider>
                <RootNavigator />
              </ThemeSceneProvider>
            </ThemeProvider>
          </NotificationBridge>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { ready, userId } = useApp();
  const theme = useNativeTheme();
  const router = useRouter();
  const pathname = usePathname();
  const settledUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const action = decideRootNavigation({
      ready,
      userId,
      settledUserId: settledUserId.current,
      pathname,
      pendingIntent: peekNavIntent(),
    });
    if (ready) settledUserId.current = userId;
    if (action.type === 'clear-intent') clearNavIntent();
    else if (action.type === 'open-intent') {
      consumeNavIntent();
      router.replace(action.intent, AUTHENTICATED_INTENT_NAVIGATION_OPTIONS);
    } else if (action.type === 'open-home') {
      router.replace(DEFAULT_APP_ROUTE);
    }
  }, [pathname, ready, router, userId]);

  const scenic = theme.scene !== 'none';
  const navigationTheme = useMemo(() => {
    const base = theme.isLight ? DefaultTheme : DarkTheme;
    return {
      ...base,
      dark: !theme.isLight,
      colors: {
        ...base.colors,
        primary: theme.colors.violet400,
        background: theme.colors.background,
        card: theme.colors.card,
        text: theme.colors.foreground,
        border: theme.colors.hairline,
      },
    };
  }, [theme]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ThemeBackdrop />
        <StatusBar style={theme.isLight ? 'dark' : 'light'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: scenic ? 'transparent' : theme.colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/callback" />
          <Stack.Protected guard={ready && !userId}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={ready && Boolean(userId)}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </View>
    </NavigationThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
