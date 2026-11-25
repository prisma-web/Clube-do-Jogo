import { avatarCropAfterPan, DEFAULT_AVATAR_CROP, normalizeAvatarCrop } from '@clube-do-jogo/domain';
import type { AvatarCrop, AvatarImageSize } from '@clube-do-jogo/domain';

// Pan e pinch rodam juntos no Gesture.Simultaneous, então cada um guarda o próprio
// começo e só mexe nos campos dele. Com um começo só, o gesto que entrava depois
// trocava o ponto de partida do outro e a imagem pulava.
export function createAvatarCropGesture(frame: number) {
  let panStart: AvatarCrop = DEFAULT_AVATAR_CROP;
  let pinchStartZoom = DEFAULT_AVATAR_CROP.zoom;
  return {
    startPan(crop: AvatarCrop) {
      panStart = crop;
    },
    pan(crop: AvatarCrop, translation: { x: number; y: number }, image: AvatarImageSize | null) {
      return avatarCropAfterPan({ ...panStart, zoom: crop.zoom }, translation, frame, image);
    },
    startPinch(crop: AvatarCrop) {
      pinchStartZoom = crop.zoom;
    },
    pinch(crop: AvatarCrop, scale: number) {
      return normalizeAvatarCrop({ ...crop, zoom: pinchStartZoom * scale });
    },
  };
}
