import { StyleSheet, View } from 'react-native';
import { themedStyles, useNativeTheme } from '@/theme';
import { CosmicScene } from './scenes/CosmicScene';
import { CrossingScene } from './scenes/CrossingScene';
import { OriScene } from './scenes/OriScene';

export function ThemeBackdrop() {
  const { scene } = useNativeTheme();
  const styles = useStyles();

  if (scene === 'none') return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {scene === 'crossing' ? <CrossingScene /> : null}
      {scene === 'ori' ? <OriScene /> : null}
      {scene === 'cosmic' ? <CosmicScene /> : null}
      <View style={styles.scrim} />
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, opacity: 0.86 },
}));
