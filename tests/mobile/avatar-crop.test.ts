import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../apps/mobile/src/${path}`, import.meta.url), 'utf8');

// Android (RN 0.86, Fabric) blanked or misplaced the avatar when a percentage transformOrigin
// was combined with transform: scale. Both renderers of the crop go through the shared helper.
for (const file of ['components/Avatar.tsx', 'features/profile/AvatarCropEditor.tsx']) {
  test(`${file} resolves the avatar crop without a percentage transformOrigin`, () => {
    const source = read(file);
    assert.doesNotMatch(source, /transformOrigin/);
    assert.match(source, /avatarNativeTransform\(/);
  });
}

test('the avatar remounts its container when switching between initials and an image', () => {
  // Reusing the initials View for the image left an empty circle on Android.
  const source = read('components/Avatar.tsx');
  assert.match(source, /<View key="image"/);
  assert.match(source, /<View key="initials"/);
});

test('the crop editor preview resolves the crop against the image box inside the ring border', () => {
  const source = read('features/profile/AvatarCropEditor.tsx');
  assert.match(source, /avatarNativeTransform\(crop, PREVIEW_IMAGE_SIZE\)/);
  assert.match(source, /PREVIEW_IMAGE_SIZE = PREVIEW_SIZE - PREVIEW_BORDER \* 2/);
  assert.match(source, /borderWidth: PREVIEW_BORDER/);
});
