import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAvatarCropGesture } from '../../apps/mobile/src/features/profile/avatar-crop-gesture';

const FRAME = 240;
const SQUARE = { width: 800, height: 800 };
const LANDSCAPE = { width: 1500, height: 1000 };

// Pan e pinch rodam juntos no Gesture.Simultaneous. Cada um começa de onde o
// recorte estava quando ele começou, mesmo que o outro já esteja em andamento.
test('pinch que começa no meio do arrasto não faz a imagem pular', () => {
  const gesture = createAvatarCropGesture(FRAME);
  const start = { x: 50, y: 50, zoom: 2 };
  gesture.startPan(start);
  const dragged = gesture.pan(start, { x: 30, y: 0 }, SQUARE);
  gesture.startPinch(dragged);
  const pinched = gesture.pinch(dragged, 1);
  // O dedo do arrasto não se mexeu desde a última atualização.
  assert.deepEqual(gesture.pan(pinched, { x: 30, y: 0 }, SQUARE), dragged);
});

test('arrasto que começa no meio do pinch não multiplica o zoom', () => {
  const gesture = createAvatarCropGesture(FRAME);
  const start = { x: 50, y: 50, zoom: 1.2 };
  gesture.startPinch(start);
  const pinched = gesture.pinch(start, 1.5);
  gesture.startPan(pinched);
  const dragged = gesture.pan(pinched, { x: 0, y: 0 }, SQUARE);
  assert.equal(gesture.pinch(dragged, 1.5).zoom, pinched.zoom);
});

test('o arrasto usa o zoom de agora e o tamanho da imagem', () => {
  const gesture = createAvatarCropGesture(FRAME);
  const start = { x: 50, y: 50, zoom: 1 };
  gesture.startPan(start);
  // 3:2 sem zoom sobra 120px na horizontal: 30px de dedo andam 25 pontos.
  assert.deepEqual(gesture.pan(start, { x: 30, y: 30 }, LANDSCAPE), { x: 25, y: 50, zoom: 1 });
  assert.deepEqual(gesture.pan(start, { x: 30, y: 30 }, SQUARE), start);
});

test('o arrasto começa de onde o recorte estava, não do centro', () => {
  const gesture = createAvatarCropGesture(FRAME);
  const start = { x: 20, y: 70, zoom: 2 };
  gesture.startPan(start);
  assert.deepEqual(gesture.pan(start, { x: 0, y: 0 }, SQUARE), start);
});

test('o arrasto acompanha o zoom que a pinça mudou no meio dele', () => {
  const gesture = createAvatarCropGesture(FRAME);
  const start = { x: 50, y: 50, zoom: 1.2 };
  gesture.startPan(start);
  gesture.startPinch(start);
  const pinched = gesture.pinch(start, 1.5);
  assert.equal(gesture.pan(pinched, { x: 0, y: 0 }, LANDSCAPE).zoom, pinched.zoom);
});

test('the preview image fills the circle inside its border, not the whole circle', async () => {
  const { IMAGE_FRAME, PREVIEW_BORDER, PREVIEW_SIZE } = await import('../../apps/mobile/src/features/profile/avatar-preview-frame');
  // O borderWidth do React Native fica dentro do width: a imagem mede o círculo menos as duas bordas.
  assert.ok(PREVIEW_BORDER > 0);
  assert.equal(IMAGE_FRAME + PREVIEW_BORDER * 2, PREVIEW_SIZE);
});
