import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, themedStyles, useThemeColors } from '@/theme';

export function RatingBadge({ value, size = 13 }: { value: number; size?: number }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityLabel={`Nota ${value.toFixed(1)} de 10`}>
      <Ionicons name="star" size={size} color={colors.amber400} />
      <Text style={[styles.text, { fontSize: size - 1 }]}>{value.toFixed(1)}</Text>
    </View>
  );
}

const useStyles = themedStyles(colors => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  text: { color: colors.amber300, fontWeight: '800' },
}));
