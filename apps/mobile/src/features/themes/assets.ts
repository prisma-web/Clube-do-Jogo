import oriForest from '../../../../../public/themes/ori/forest-mobile.webp';
import oriForestWide from '../../../../../public/themes/ori/forest-desktop.webp';
import cosmicHearth from '../../../../../public/themes/cosmic-campfire/hearth-mobile-v1.webp';
import cosmicObservatory from '../../../../../public/themes/cosmic-campfire/observatory-mobile.webp';
import timberHearth from '../../../../../public/themes/cosmic-campfire/timber-hearth-v1.webp';
import brittleHollow from '../../../../../public/themes/cosmic-campfire/brittle-hollow-v1.webp';
import darkBramble from '../../../../../public/themes/cosmic-campfire/dark-bramble-v1.webp';
import giantsDeep from '../../../../../public/themes/cosmic-campfire/giants-deep-v1.webp';
import hourglassTwins from '../../../../../public/themes/cosmic-campfire/hourglass-twins-v1.webp';
import quantumMoon from '../../../../../public/themes/cosmic-campfire/quantum-moon-v1.webp';
import ringedBody from '../../../../../public/themes/cosmic-campfire/spaceflight-ringed-body-v2.webp';
import rockyBody from '../../../../../public/themes/cosmic-campfire/spaceflight-rocky-v1.webp';

import ambienceHearth from '../../../assets/audio/ambience-hearth.wav';
import ambienceSpaceflight from '../../../assets/audio/ambience-spaceflight.wav';
import signalEnable from '../../../assets/audio/signal-enable.wav';
import signalPress from '../../../assets/audio/signal-press.wav';
import signalSelect from '../../../assets/audio/signal-select.wav';
import signalOpen from '../../../assets/audio/signal-open.wav';
import signalClose from '../../../assets/audio/signal-close.wav';
import signalNavigate from '../../../assets/audio/signal-navigate.wav';

export const themeImages = {
  oriForest,
  oriForestWide,
  cosmicHearth,
  cosmicObservatory,
  timberHearth,
  brittleHollow,
  darkBramble,
  giantsDeep,
  hourglassTwins,
  quantumMoon,
  ringedBody,
  rockyBody,
} as const;

export const themeAudio = {
  ambienceHearth,
  ambienceSpaceflight,
  signalEnable,
  signalPress,
  signalSelect,
  signalOpen,
  signalClose,
  signalNavigate,
} as const;

export type ThemeSignal = 'enable' | 'press' | 'select' | 'open' | 'close' | 'navigate';

export const signalSources: Record<ThemeSignal, number> = {
  enable: themeAudio.signalEnable,
  press: themeAudio.signalPress,
  select: themeAudio.signalSelect,
  open: themeAudio.signalOpen,
  close: themeAudio.signalClose,
  navigate: themeAudio.signalNavigate,
};
