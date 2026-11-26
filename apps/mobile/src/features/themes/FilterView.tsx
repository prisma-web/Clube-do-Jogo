import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { blendLayers, type ImageFilter } from './blend-filter';

export function FilterView({ filter, style, children }: { filter: ImageFilter | null; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  if (!filter) return <View style={style}>{children}</View>;
  if (Platform.OS !== 'ios') return <View style={[style, { filter }]}>{children}</View>;
  return (
    <View style={style}>
      {children}
      {blendLayers(filter).map((layer, index) => (
        <View key={index} style={[StyleSheet.absoluteFill, layer]} pointerEvents="none" />
      ))}
    </View>
  );
}
