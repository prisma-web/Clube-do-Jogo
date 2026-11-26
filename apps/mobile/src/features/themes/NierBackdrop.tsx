import { memo, useState, type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

const tile = { width: 180, height: 150, cell: 30 };
const layerOpacity = 0.78;
const ink = (alpha: number) => `rgba(75, 65, 61, ${Number((alpha * layerOpacity).toFixed(4))})`;
const gridColor = ink(0.07);
const shapeColor = ink(0.13);
const crossColor = ink(0.14);
const diamondSide = 14 * Math.SQRT2 + 1;

const tileMarks: { left: number; top: number; style: ViewStyle }[] = [
  { left: 141 - diamondSide / 2, top: 57 - diamondSide / 2, style: { width: diamondSide, height: diamondSide, borderWidth: 1, borderColor: shapeColor, transform: [{ rotate: '45deg' }] } },
  { left: 24.5, top: 96.5, style: { width: 19, height: 19, borderWidth: 1, borderColor: shapeColor } },
  { left: 110.5, top: 44, style: { width: 1, height: 28, backgroundColor: crossColor } },
  { left: 97, top: 57.5, style: { width: 13.5, height: 1, backgroundColor: crossColor } },
  { left: 111.5, top: 57.5, style: { width: 13.5, height: 1, backgroundColor: crossColor } },
];

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

const Grid = memo(function Grid({ width, height }: { width: number; height: number }) {
  const marks: ReactElement[] = [];
  for (const column of range(Math.ceil(width / tile.cell))) {
    marks.push(<View key={`v${column}`} style={[styles.mark, { left: column * tile.cell, top: 0, width: 1, height, backgroundColor: gridColor }]} />);
  }
  for (const row of range(Math.ceil(height / tile.cell))) {
    marks.push(<View key={`h${row}`} style={[styles.mark, { left: 0, top: row * tile.cell, width, height: 1, backgroundColor: gridColor }]} />);
  }
  for (const row of range(Math.ceil(height / tile.height))) {
    for (const column of range(Math.ceil(width / tile.width))) {
      tileMarks.forEach(({ left, top, style }, index) => {
        const position = { left: left + column * tile.width, top: top + row * tile.height };
        marks.push(<View key={`t${row}-${column}-${index}`} style={[styles.mark, style, position]} />);
      });
    }
  }
  return marks;
});

export function NierBackdrop() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        setSize(current => current?.width === width && current.height === height ? current : { width, height });
      }}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      {size ? <Grid width={size.width} height={size.height} /> : null}
      <View style={styles.ambient} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { position: 'absolute' },
  ambient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(244, 239, 216, 0.38), rgba(244, 239, 216, 0) 38%)',
  },
});
