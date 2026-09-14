import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { DEFAULT_AVATAR_CROP, normalizeAvatarCrop, type AvatarCrop } from '@clube-do-jogo/domain';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';

export const DEFAULT_AVATAR_SELECTION_CROP: AvatarCrop = { ...DEFAULT_AVATAR_CROP, zoom: 1.1 };

const PREVIEW_SIZE = 240;

export function AvatarCropEditor({ visible, imageUrl, name, crop: initialCrop, saving, onClose, onSave }: {
  visible: boolean;
  imageUrl: string | null;
  name: string;
  crop: AvatarCrop;
  saving: boolean;
  onClose: () => void;
  onSave: (crop: AvatarCrop) => void;
}) {
  const colors = useThemeColors();
  const styles = useStyles();
  const [crop, setCrop] = useState(initialCrop);
  const dragStart = useSharedValue(initialCrop);



  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => { dragStart.value = crop; })
    .onUpdate(event => {
      setCrop(current => normalizeAvatarCrop({
        ...current,
        x: dragStart.value.x - (event.translationX / PREVIEW_SIZE) * 100,
        y: dragStart.value.y - (event.translationY / PREVIEW_SIZE) * 100,
      }));
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => { dragStart.value = crop; })
    .onUpdate(event => {
      setCrop(current => normalizeAvatarCrop({ ...current, zoom: dragStart.value.zoom * event.scale }));
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  if (!visible || !imageUrl) return null;

  return (
    <Sheet visible={visible} title="Ajustar avatar" onClose={onClose}>
      <View style={styles.content}>
        <GestureDetector gesture={composed}>
          <View style={styles.previewWrap} accessible={false}>
            <Image
              source={{ uri: imageUrl }}
              style={[StyleSheet.absoluteFill, { transform: [{ scale: crop.zoom }], transformOrigin: `${crop.x}% ${crop.y}%` }]}
              contentFit="cover"
              contentPosition={{ top: `${crop.y}%`, left: `${crop.x}%` }}
              accessibilityLabel={name}
            />
            <View pointerEvents="none" style={styles.previewRing} />
          </View>
        </GestureDetector>

        <View style={styles.nameRow}>
          <Ionicons name="person-circle-outline" size={16} color={colors.violet300} />
          <Text style={styles.nameText} numberOfLines={1}>{name}</Text>
        </View>

        <View style={styles.zoomRow}>
          <Text style={styles.zoomLabel}>Zoom</Text>
          <View style={styles.zoomControls}>
            <ZoomButton icon="remove" onPress={() => setCrop(current => normalizeAvatarCrop({ ...current, zoom: current.zoom - 0.1 }))} />
            <Text style={styles.zoomValue}>{crop.zoom.toFixed(2)}x</Text>
            <ZoomButton icon="add" onPress={() => setCrop(current => normalizeAvatarCrop({ ...current, zoom: current.zoom + 0.1 }))} />
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Button
            label="Centralizar"
            variant="secondary"
            icon={<Ionicons name="refresh" size={15} color={colors.zinc300} />}
            onPress={() => setCrop(DEFAULT_AVATAR_SELECTION_CROP)}
            style={styles.actionButton}
          />
          <Button
            label={saving ? 'Salvando…' : 'Usar avatar'}
            loading={saving}
            icon={<Ionicons name="checkmark" size={15} color={colors.white} />}
            onPress={() => onSave(crop)}
            style={styles.actionButton}
          />
        </View>
      </View>
    </Sheet>
  );
}

function ZoomButton({ icon, onPress }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const colors = useThemeColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={icon === 'add' ? 'Aumentar zoom' : 'Diminuir zoom'}
      hitSlop={8}
      style={styles.zoomButton}
    >
      <Ionicons name={icon} size={16} color={colors.zinc300} />
    </Pressable>
  );
}

const useStyles = themedStyles(colors => ({
  content: { padding: spacing.lg, gap: spacing.lg },
  previewWrap: {
    alignSelf: 'center',
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: PREVIEW_SIZE / 2,
    overflow: 'hidden',
    backgroundColor: colors.zinc900,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.35)',
  },
  previewRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: PREVIEW_SIZE / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  nameText: { ...typography.small, color: colors.zinc300, fontWeight: '800' },
  zoomRow: { gap: spacing.xs },
  zoomLabel: { ...typography.tiny, color: colors.zinc500 },
  zoomControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  zoomButton: { width: 34, height: 34, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceDeep },
  zoomValue: { ...typography.small, color: colors.zinc300, minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
}));
