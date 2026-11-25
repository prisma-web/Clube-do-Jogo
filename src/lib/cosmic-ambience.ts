import type { CosmicBackdropMode } from './cosmic-backdrop';

export const COSMIC_AMBIENCE_STORAGE_KEY = 'clube-do-jogo:cosmic-ambience';
export const COSMIC_AMBIENCE_VOLUME_STORAGE_KEY = 'clube-do-jogo:cosmic-ambience-volume';
export const COSMIC_AMBIENCE_EVENT = 'clube-do-jogo:cosmic-ambience-change';
export const COSMIC_AMBIENCE_VOLUME_EVENT = 'clube-do-jogo:cosmic-ambience-volume-change';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type AmbienceGraph = {
  context: AudioContext;
  master: GainNode;
  sources: AudioScheduledSourceNode[];
  crackleTimer: number | null;
  spaceTimer: number | null;
  giantGain: GainNode | null;
  mode: CosmicBackdropMode;
};

let graph: AmbienceGraph | null = null;
let spaceflightGiantPresence = 0;

const DEFAULT_AMBIENCE_VOLUME = 0.8;
const MODE_GAIN: Record<CosmicBackdropMode, number> = {
  hearth: 1.12,
  spaceflight: 1.22,
};

export function isCosmicAmbienceEnabled() {
  try {
    return window.localStorage.getItem(COSMIC_AMBIENCE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCosmicAmbienceEnabled(enabled: boolean) {
  window.localStorage.setItem(COSMIC_AMBIENCE_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(COSMIC_AMBIENCE_EVENT, { detail: enabled }));
}

export function getCosmicAmbienceVolume() {
  try {
    const raw = window.localStorage.getItem(COSMIC_AMBIENCE_VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_AMBIENCE_VOLUME;
    const stored = Number(raw);
    return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_AMBIENCE_VOLUME;
  } catch {
    return DEFAULT_AMBIENCE_VOLUME;
  }
}

export function setCosmicAmbienceVolume(volume: number) {
  const next = Math.min(1, Math.max(0, volume));
  window.localStorage.setItem(COSMIC_AMBIENCE_VOLUME_STORAGE_KEY, String(next));
  if (graph) {
    const now = graph.context.currentTime;
    graph.master.gain.cancelScheduledValues(now);
    graph.master.gain.setTargetAtTime(MODE_GAIN[graph.mode] * next, now, 0.045);
  }
  window.dispatchEvent(new CustomEvent(COSMIC_AMBIENCE_VOLUME_EVENT, { detail: next }));
}

function targetGain(mode: CosmicBackdropMode) {
  return Math.max(0.0001, MODE_GAIN[mode] * getCosmicAmbienceVolume());
}

export function setSpaceflightGiantPresence(presence: number) {
  spaceflightGiantPresence = Math.min(1, Math.max(0, presence));
  if (!graph?.giantGain || graph.mode !== 'spaceflight') return;
  const now = graph.context.currentTime;
  const target = spaceflightGiantPresence > 0
    ? 0.05 + Math.pow(spaceflightGiantPresence, 0.72) * 0.035
    : 0.0001;
  graph.giantGain.gain.cancelScheduledValues(now);
  graph.giantGain.gain.setTargetAtTime(target, now, spaceflightGiantPresence > 0 ? 0.45 : 0.9);
}

function createBrownNoise(context: AudioContext, seconds = 5) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.018 * white) / 1.018;
    data[index] = Math.max(-1, Math.min(1, brown * 3.3));
  }
  return buffer;
}

function createNoiseSource(context: AudioContext, seconds = 5) {
  const source = context.createBufferSource();
  source.buffer = createBrownNoise(context, seconds);
  source.loop = true;
  return source;
}

function buildHearth(context: AudioContext, master: GainNode, sources: AudioScheduledSourceNode[]) {
  const bed = createNoiseSource(context, 13);
  const bedLowpass = context.createBiquadFilter();
  const bedHighpass = context.createBiquadFilter();
  const bedGain = context.createGain();
  const sway = context.createOscillator();
  const swayDepth = context.createGain();
  const texture = createNoiseSource(context, 19);
  const textureBandpass = context.createBiquadFilter();
  const textureGain = context.createGain();
  const textureSway = context.createOscillator();
  const textureSwayDepth = context.createGain();

  bedLowpass.type = 'lowpass';
  bedLowpass.frequency.value = 430;
  bedLowpass.Q.value = 0.42;
  bedHighpass.type = 'highpass';
  bedHighpass.frequency.value = 48;
  bedGain.gain.value = 0.027;
  sway.type = 'sine';
  sway.frequency.value = 0.11;
  swayDepth.gain.value = 0.006;
  sway.connect(swayDepth);
  swayDepth.connect(bedGain.gain);
  bed.connect(bedLowpass);
  bedLowpass.connect(bedHighpass);
  bedHighpass.connect(bedGain);
  bedGain.connect(master);
  bed.start();
  sway.start();
  texture.playbackRate.value = 0.73;
  textureBandpass.type = 'bandpass';
  textureBandpass.frequency.value = 760;
  textureBandpass.Q.value = 0.48;
  textureGain.gain.value = 0.007;
  textureSway.type = 'sine';
  textureSway.frequency.value = 0.067;
  textureSwayDepth.gain.value = 0.0025;
  texture.connect(textureBandpass);
  textureBandpass.connect(textureGain);
  textureGain.connect(master);
  textureSway.connect(textureSwayDepth);
  textureSwayDepth.connect(textureGain.gain);
  texture.start();
  textureSway.start();
  sources.push(bed, sway, texture, textureSway);

  const emitCrackle = (kind: 'snap' | 'wood') => {
    if (!graph || graph.context !== context || graph.mode !== 'hearth') return;
    const duration = kind === 'snap' ? 0.014 + Math.random() * 0.036 : 0.075 + Math.random() * 0.12;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const progress = index / data.length;
      const attack = Math.min(1, progress / 0.045);
      const decay = Math.pow(1 - progress, kind === 'snap' ? 3.8 : 2.1);
      const grain = kind === 'wood' ? 0.58 + 0.42 * Math.sin(index * 0.19) : 1;
      data[index] = (Math.random() * 2 - 1) * attack * decay * grain;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = kind === 'snap' ? 'bandpass' : 'lowpass';
    filter.frequency.value = kind === 'snap' ? 1100 + Math.random() * 2300 : 480 + Math.random() * 720;
    filter.Q.value = kind === 'snap' ? 0.85 + Math.random() * 0.8 : 0.35;
    gain.gain.value = kind === 'snap' ? 0.01 + Math.random() * 0.019 : 0.006 + Math.random() * 0.011;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(context.currentTime + duration);
  };

  const scheduleCrackle = () => {
    if (!graph || graph.context !== context || graph.mode !== 'hearth') return;
    const chance = Math.random();
    const count = chance < 0.16 ? 3 : chance < 0.42 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      window.setTimeout(() => emitCrackle(index === 0 && Math.random() < 0.34 ? 'wood' : 'snap'), index * (55 + Math.random() * 150));
    }
    graph.crackleTimer = window.setTimeout(scheduleCrackle, 780 + Math.random() * 3900);
  };
  graph!.crackleTimer = window.setTimeout(scheduleCrackle, 620);
}

function buildSpace(context: AudioContext, master: GainNode, sources: AudioScheduledSourceNode[]) {
  const voices = [
    { frequency: 43.65, gain: 0.05, pan: -0.42, drift: 1.4 },
    { frequency: 65.41, gain: 0.021, pan: 0.36, drift: 2.1 },
    { frequency: 87.31, gain: 0.009, pan: -0.2, drift: 2.8 },
    { frequency: 130.81, gain: 0.004, pan: 0.5, drift: 3.8 },
    { frequency: 196.31, gain: 0.002, pan: 0.06, drift: 4.6 },
  ];
  voices.forEach(({ frequency, gain: level, pan, drift }, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const driftOscillator = context.createOscillator();
    const driftDepth = context.createGain();
    const panOscillator = context.createOscillator();
    const panDepth = context.createGain();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    oscillator.detune.value = [-3, 2, -5, 7, -8][index];
    gain.gain.value = level;
    panner.pan.value = pan;
    driftOscillator.frequency.value = 0.004 + index * 0.0017;
    driftDepth.gain.value = drift;
    panOscillator.frequency.value = 0.003 + index * 0.0011;
    panDepth.gain.value = 0.08 + index * 0.014;
    driftOscillator.connect(driftDepth);
    driftDepth.connect(oscillator.detune);
    panOscillator.connect(panDepth);
    panDepth.connect(panner.pan);
    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    oscillator.start();
    driftOscillator.start();
    panOscillator.start();
    sources.push(oscillator, driftOscillator, panOscillator);
  });

  const wash = createNoiseSource(context, 17);
  const lowpass = context.createBiquadFilter();
  const highpass = context.createBiquadFilter();
  const washGain = context.createGain();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 118;
  lowpass.Q.value = 0.2;
  highpass.type = 'highpass';
  highpass.frequency.value = 24;
  washGain.gain.value = 0.0045;
  wash.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(washGain);
  washGain.connect(master);
  wash.start();
  sources.push(wash);

  const giantGain = context.createGain();
  const giantFilter = context.createBiquadFilter();
  const giantRumble = createNoiseSource(context, 23);
  const giantRumbleHighpass = context.createBiquadFilter();
  const giantRumbleLowpass = context.createBiquadFilter();
  const giantRumbleMix = context.createGain();
  giantGain.gain.value = 0.0001;
  giantFilter.type = 'lowpass';
  giantFilter.frequency.value = 340;
  giantFilter.Q.value = 0.38;
  giantGain.connect(giantFilter);
  giantFilter.connect(master);
  [55, 82.41, 83.25, 110, 164.81, 220].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const mix = context.createGain();
    oscillator.type = index === 3 ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    oscillator.detune.value = [-4, 3, -7, 0, 5, -3][index];
    mix.gain.value = [0.29, 0.18, 0.14, 0.13, 0.065, 0.028][index];
    oscillator.connect(mix);
    mix.connect(giantGain);
    oscillator.start();
    sources.push(oscillator);
  });
  giantRumbleHighpass.type = 'highpass';
  giantRumbleHighpass.frequency.value = 46;
  giantRumbleLowpass.type = 'lowpass';
  giantRumbleLowpass.frequency.value = 260;
  giantRumbleLowpass.Q.value = 0.3;
  giantRumbleMix.gain.value = 0.105;
  giantRumble.connect(giantRumbleHighpass);
  giantRumbleHighpass.connect(giantRumbleLowpass);
  giantRumbleLowpass.connect(giantRumbleMix);
  giantRumbleMix.connect(giantGain);
  giantRumble.start();
  sources.push(giantRumble);
  graph!.giantGain = giantGain;
  setSpaceflightGiantPresence(spaceflightGiantPresence);

  const delay = context.createDelay(2.4);
  const feedback = context.createGain();
  const echoFilter = context.createBiquadFilter();
  delay.delayTime.value = 1.72;
  feedback.gain.value = 0.24;
  echoFilter.type = 'lowpass';
  echoFilter.frequency.value = 940;
  delay.connect(feedback);
  feedback.connect(echoFilter);
  echoFilter.connect(delay);
  delay.connect(master);

  const emitBloom = () => {
    if (!graph || graph.context !== context || graph.mode !== 'spaceflight') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const frequencies = [207.65, 233.08, 293.66, 311.13];
    const now = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequencies[Math.floor(Math.random() * frequencies.length)];
    oscillator.detune.value = -11 + Math.random() * 22;
    panner.pan.value = -0.72 + Math.random() * 1.44;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.0022 + Math.random() * 0.0016, now + 3.8 + Math.random() * 1.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 13 + Math.random() * 4);
    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    panner.connect(delay);
    oscillator.start(now);
    oscillator.stop(now + 18);
  };
  const scheduleBloom = () => {
    if (!graph || graph.context !== context || graph.mode !== 'spaceflight') return;
    emitBloom();
    graph.spaceTimer = window.setTimeout(scheduleBloom, 11000 + Math.random() * 19000);
  };
  graph!.spaceTimer = window.setTimeout(scheduleBloom, 6500 + Math.random() * 6500);
}

export function startCosmicAmbience(mode: CosmicBackdropMode) {
  if (!isCosmicAmbienceEnabled()) return;
  if (graph?.mode === mode) {
    if (graph.context.state === 'suspended') void graph.context.resume();
    graph.master.gain.setTargetAtTime(targetGain(mode), graph.context.currentTime, 0.045);
    return;
  }
  stopCosmicAmbience();

  const AudioContextClass = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const master = context.createGain();
  const sources: AudioScheduledSourceNode[] = [];
  master.gain.setValueAtTime(0.0001, context.currentTime);
  master.gain.exponentialRampToValueAtTime(targetGain(mode), context.currentTime + 0.8);
  master.connect(context.destination);
  graph = { context, master, sources, crackleTimer: null, spaceTimer: null, giantGain: null, mode };
  if (mode === 'hearth') buildHearth(context, master, sources);
  else buildSpace(context, master, sources);
  if (context.state === 'suspended') void context.resume();
}

export function stopCosmicAmbience() {
  const active = graph;
  graph = null;
  if (!active) return;
  if (active.crackleTimer !== null) window.clearTimeout(active.crackleTimer);
  if (active.spaceTimer !== null) window.clearTimeout(active.spaceTimer);
  const now = active.context.currentTime;
  active.master.gain.cancelScheduledValues(now);
  active.master.gain.setValueAtTime(Math.max(active.master.gain.value, 0.0001), now);
  active.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  window.setTimeout(() => {
    active.sources.forEach(source => { try { source.stop(); } catch {  } });
    void active.context.close();
  }, 340);
}
