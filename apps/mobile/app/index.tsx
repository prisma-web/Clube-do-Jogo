import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useApp } from '@/state/app-provider';
import { themedStyles, useThemeColors } from '@/theme';

export default function Index() {
  const colors = useThemeColors();
  const styles = useStyles();
  const { ready, userId } = useApp();

  if (ready && !userId) return <Redirect href="/(auth)/login" />;

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Carregando Clube do Jogo">
      <ActivityIndicator color={colors.violet400} size="large" />
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
}));
