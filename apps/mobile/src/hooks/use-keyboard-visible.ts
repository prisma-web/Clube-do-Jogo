import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { keyboardEventNames } from './keyboard-visibility-core';

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const names = keyboardEventNames(Platform.OS);
    const show = Keyboard.addListener(names.show, () => setVisible(true));
    const hide = Keyboard.addListener(names.hide, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
