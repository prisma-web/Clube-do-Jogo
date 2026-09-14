import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';

export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violet400,
        tabBarInactiveTintColor: colors.zinc500,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.hairline, borderTopWidth: 1 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="jogo-do-mes"
        options={{ title: 'Jogo do mês', tabBarIcon: ({ color, size }) => <Ionicons name="game-controller" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="ranking"
        options={{ title: 'Ranking', tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="jogos"
        options={{ title: 'Explorar', tabBarIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="seus-jogos"
        options={{ title: 'Meus jogos', tabBarIcon: ({ color, size }) => <Ionicons name="library" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
