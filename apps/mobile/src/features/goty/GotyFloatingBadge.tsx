import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { GOTY_ROUTE } from '@/lib/nav-intent';
import { gotyBadgeBottomOffset, gotyBadgeClearance, isGotyBadgeVisible } from './goty-logic';
import { gotyColors } from './goty-theme';
import { TgaEmblem } from './TgaEmblem';

export function useGotyBadgeClearance(): number {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return gotyBadgeClearance(pathname, insets.bottom);
}

export function GotyFloatingBadge() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  if (!isGotyBadgeVisible(pathname, keyboardVisible)) return null;

  const bottom = gotyBadgeBottomOffset(pathname, insets.bottom);

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom, right: 14 + insets.right }]}>
      <Pressable
        onPress={() => router.push(GOTY_ROUTE)}
        accessibilityRole="button"
        accessibilityLabel="Abrir experiência especial GOTY 2026"
        accessibilityHint="Bolão do The Game Awards e Seu GOTY"
        hitSlop={6}
        style={({ pressed }) => [styles.badge, pressed && styles.pressed]}
      >
        <View style={styles.emblem}>
          <TgaEmblem size={22} />
        </View>
        <View>
          <Text style={styles.eyebrow}>Especial</Text>
          <Text style={styles.title}>GOTY 2026</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', zIndex: 60 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(227,193,104,0.5)',
    backgroundColor: 'rgba(12,11,16,0.96)',
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 14,
    shadowColor: '#dab048',
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.92 },
  emblem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(242,214,135,0.4)',
    backgroundColor: '#1d170d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { color: gotyColors.goldStrong, fontSize: 8.5, fontWeight: '900', letterSpacing: 1.8, textTransform: 'uppercase' },
  title: { color: gotyColors.textStrong, fontSize: 12, fontWeight: '900', letterSpacing: -0.2, marginTop: 1 },
});
