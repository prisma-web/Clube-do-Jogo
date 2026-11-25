import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

type Blade = { x1: number; y1: number; x2: number; y2: number; thickness: number };

const LEFT_BLADES: Blade[] = [
  { x1: 10.5, y1: 13.2, x2: 26.5, y2: 26.6, thickness: 4.6 },
  { x1: 14, y1: 24.4, x2: 26.5, y2: 34.6, thickness: 4.2 },
  { x1: 18.8, y1: 35.4, x2: 26.8, y2: 42.2, thickness: 3.8 },
];

function bladeGeometry(blade: Blade, mirrored: boolean) {
  const x1 = mirrored ? 64 - blade.x1 : blade.x1;
  const x2 = mirrored ? 64 - blade.x2 : blade.x2;
  const dx = x2 - x1;
  const dy = blade.y2 - blade.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    cx: (x1 + x2) / 2,
    cy: (blade.y1 + blade.y2) / 2,
    length,
    thickness: blade.thickness,
    angle,
  };
}

const BLADES = [
  ...LEFT_BLADES.map(blade => bladeGeometry(blade, false)),
  ...LEFT_BLADES.map(blade => bladeGeometry(blade, true)),
];

export const TgaEmblem = memo(function TgaEmblem({
  size = 32,
  color = '#dfb451',
  highlight = '#fff0b8',
  opacity = 1,
  style,
}: {
  size?: number;
  color?: string;
  highlight?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const u = size / 64;
  return (
    <View
      style={[{ width: size, height: size, opacity }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          position: 'absolute',
          left: 32 * u - 2.4 * u,
          top: 7 * u,
          width: 4.8 * u,
          height: 50 * u,
          borderTopLeftRadius: 2.4 * u,
          borderTopRightRadius: 2.4 * u,
          borderBottomLeftRadius: 2.4 * u,
          borderBottomRightRadius: 2.4 * u,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 32 * u - 0.9 * u,
          top: 10 * u,
          width: 1.8 * u,
          height: 34 * u,
          borderRadius: 0.9 * u,
          backgroundColor: highlight,
          opacity: 0.55,
        }}
      />
      {BLADES.map((blade, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: (blade.cx - blade.length / 2) * u,
            top: (blade.cy - blade.thickness / 2) * u,
            width: blade.length * u,
            height: blade.thickness * u,
            borderRadius: 1.2 * u,
            backgroundColor: color,
            transform: [{ rotate: `${blade.angle}deg` }],
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: 24 * u,
          top: 53.5 * u,
          width: 11 * u,
          height: 0,
          borderBottomWidth: 4 * u,
          borderLeftWidth: 2.5 * u,
          borderRightWidth: 2.5 * u,
          borderBottomColor: color,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          opacity: 0.92,
        }}
      />
    </View>
  );
});
