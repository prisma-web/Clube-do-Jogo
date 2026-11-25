import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';
import type { ReactElement, ReactNode } from 'react';
import { avatarPreviewOffset, type AvatarCrop } from '@clube-do-jogo/domain';

// O editor de verdade, com os gestos de verdade. Só a borda nativa é falsa: o
// GestureDetector guarda os handlers que o editor registra, e a Image é uma função
// que o teste acha na árvore para ler o transform.
const appRequire = createRequire(path.join(process.cwd(), 'apps/mobile/package.json'));
const { createElement, useState } = appRequire('react') as typeof import('react');
const { renderToStaticMarkup } = appRequire('react-dom/server') as typeof import('react-dom/server');

type Handler = (event?: { translationX: number; translationY: number }) => void;
type Builder = { handlers: Record<string, Handler>; runOnJS(): Builder; onStart(handler: Handler): Builder; onUpdate(handler: Handler): Builder };
const builders: Record<'pan' | 'pinch', Builder | null> = { pan: null, pinch: null };
function builder(kind: 'pan' | 'pinch'): Builder {
  const self: Builder = {
    handlers: {},
    runOnJS: () => self,
    onStart: handler => { self.handlers.start = handler; return self; },
    onUpdate: handler => { self.handlers.update = handler; return self; },
  };
  builders[kind] = self;
  return self;
}

const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
const Image = () => null;
mock.module('react-native', { exports: { Pressable: passthrough, StyleSheet: { absoluteFill: {} }, Text: passthrough, View: passthrough } });
mock.module('expo-image', { exports: { Image } });
mock.module('@expo/vector-icons', { exports: { Ionicons: () => null } });
mock.module('react-native-gesture-handler', {
  exports: { Gesture: { Pan: () => builder('pan'), Pinch: () => builder('pinch'), Simultaneous: () => ({}) }, GestureDetector: passthrough },
});
mock.module('@/components/Sheet', { exports: { Sheet: passthrough } });
mock.module('@/components/Button', { exports: { Button: () => null } });
mock.module('@/theme', { exports: { themedStyles: () => () => ({}), useThemeColors: () => ({}), radii: {}, spacing: {}, typography: {} } });

const editorModule = import('../../apps/mobile/src/features/profile/AvatarCropEditor');

type ImageProps = { style: [unknown, { transform: [{ translateX: number }, { translateY: number }, { scale: number }] }] };

function findImage(node: ReactNode): ImageProps | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findImage(child);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object' || !('type' in node)) return null;
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === Image) return element.props as unknown as ImageProps;
  return findImage(element.props.children);
}

// Renderiza o editor com `crop` e, entre a primeira e a segunda passada, arrasta o dedo
// `drag` pixels. Devolve o translate da imagem em cada passada.
async function translations(crop: AvatarCrop, drag?: { x: number; y: number }) {
  const { AvatarCropEditor } = await editorModule;
  const seen: Array<{ x: number; y: number }> = [];
  function Parent() {
    const [pass, setPass] = useState(0);
    const image = findImage(AvatarCropEditor({ visible: true, imageUrl: 'https://media.rawg.io/shot.jpg', name: 'Tunic', crop, saving: false, onClose() {}, onSave() {} }));
    const [translateX, translateY] = image!.style[1].transform;
    seen.push({ x: translateX.translateX, y: translateY.translateY });
    if (drag && pass === 0) {
      builders.pan!.handlers.start();
      builders.pan!.handlers.update({ translationX: drag.x, translationY: drag.y });
      setPass(1);
    }
    return null;
  }
  renderToStaticMarkup(createElement(Parent));
  return seen;
}

test('the preview places the crop the way the saved avatar shows it inside the border', async () => {
  const { PREVIEW_BORDER, PREVIEW_SIZE } = await import('../../apps/mobile/src/features/profile/avatar-preview-frame');
  // A imagem ocupa o círculo menos as duas bordas; é esse o tamanho do Avatar salvo.
  const visible = PREVIEW_SIZE - PREVIEW_BORDER * 2;
  const crop = { x: 0, y: 100, zoom: 2 };
  const [placed] = await translations(crop);
  assert.deepEqual(placed, avatarPreviewOffset(visible, null, crop));
});

test('dragging the preview moves the image exactly as far as the finger', async () => {
  const [before, after] = await translations({ x: 50, y: 50, zoom: 2 }, { x: 100, y: -40 });
  assert.deepEqual({ x: after.x - before.x, y: after.y - before.y }, { x: 100, y: -40 });
});
