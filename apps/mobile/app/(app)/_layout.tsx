import { Stack } from 'expo-router';
import { useApp } from '@/state/app-provider';
import { RewardsGate } from '@/features/rewards';
import { ProductUpdateGate } from '@/features/product-updates';
import { useNativeTheme } from '@/theme';
import { APP_STACK_ANCHOR } from '@/lib/nav-intent';

export const unstable_settings = { anchor: APP_STACK_ANCHOR };

export default function AppGroupLayout() {
  const { userId } = useApp();
  const theme = useNativeTheme();
  const scenic = theme.scene !== 'none';

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.foreground,
          headerTitleStyle: { fontWeight: '800' },
          headerShadowVisible: false,
          headerBackTitle: 'Voltar',
          contentStyle: { backgroundColor: scenic ? 'transparent' : theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="jogos/[id]" options={{ title: 'Jogo' }} />
        <Stack.Screen name="perfil/[id]" options={{ title: 'Perfil' }} />
        <Stack.Screen name="configuracoes" options={{ title: 'Configurações' }} />
      </Stack>
      <RewardsGate key={userId ?? 'anonymous'} />
      <ProductUpdateGate key={`product-update-${userId ?? 'anonymous'}`} />
    </>
  );
}
