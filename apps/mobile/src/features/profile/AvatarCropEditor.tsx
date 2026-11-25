import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { avatarPreviewOffset, DEFAULT_AVATAR_CROP, normalizeAvatarCrop, type AvatarCrop, type AvatarImageSize } from '@clube-do-jogo/domain';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { themedStyles, useThemeColors, radii, spacing, typography } from '@/theme';
import { createAvatarCropGesture } from './avatar-crop-gesture';
import { IMAGE_FRAME, PREVIEW_BORDER, PREVIEW_SIZE } from './avatar-preview-frame';

export const DEFAULT_AVATAR_SELECTION_CROP: AvatarCrop = { ...DEFAULT_AVATAR_CROP, zoom: 1.1 };

// Fixo de propósito. contentPosition é prop do expo-image, e mexer nela durante o
// gesto remontava a imagem a cada quadro, deixando o círculo vazio até o dedo parar.
// O recorte vive no transform, e avatarPreviewOffset faz ele bater com o Avatar.
const CONTENT_POSITION = { top: '50%', left: '50%' } as const;

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
  const [gesture] = useState(() => createAvatarCropGesture(IMAGE_FRAME));
  // Tamanho natural da imagem aberta. Até o onLoad dela, a prévia trata como quadrada.
  const [loaded, setLoaded] = useState<{ uri: string; size: AvatarImageSize } | null>(null);
  const imageSize = loaded && loaded.uri === imageUrl ? loaded.size : null;
  const offset = avatarPreviewOffset(IMAGE_FRAME, imageSize, crop);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => gesture.startPan(crop))
    .onUpdate(event => {
      setCrop(current => gesture.pan(current, { x: event.translationX, y: event.translationY }, imageSize));
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(() => gesture.startPinch(crop))
    .onUpdate(event => {
      setCrop(current => gesture.pinch(current, event.scale));
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
              style={[StyleSheet.absoluteFill, {
                transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale: crop.zoom }],
              }]}
              contentFit="cover"
              contentPosition={CONTENT_POSITION}
              onLoad={event => setLoaded({ uri: imageUrl, size: { width: event.source.width, height: event.source.height } })}
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
    borderWidth: PREVIEW_BORDER,
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
