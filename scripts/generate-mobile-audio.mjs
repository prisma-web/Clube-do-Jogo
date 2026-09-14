#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 22050;
const TEXTURE_PLAYBACK_RATE = 0.73;
const BLOOM_START_FRACTION = 0.22;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outIndex = process.argv.indexOf('--out');
const outDir = resolve(repoRoot, outIndex === -1 ? 'apps/mobile/assets/audio' : process.argv[outIndex + 1]);

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function biquad(type, frequency, q) {
  const omega = (2 * Math.PI * frequency) / SAMPLE_RATE;
  const sin = Math.sin(omega);
  const cos = Math.cos(omega);
  const alpha = sin / (2 * q);
  let b0;
  let b1;
  let b2;
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return sample => {
    const output = (b0 / a0) * sample + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1;
    x1 = sample;
    y2 = y1;
    y1 = output;
    return output;
  };
}

function brownNoise(length, random) {
  const data = new Float64Array(length);
  let brown = 0;
  for (let index = 0; index < length; index += 1) {
    const white = random() * 2 - 1;
    brown = (brown + 0.018 * white) / 1.018;
    data[index] = Math.max(-1, Math.min(1, brown * 3.3));
  }
  return data;
}

function triangle(phase) {
  const wrapped = phase - Math.floor(phase);
  return 4 * Math.abs(wrapped - 0.5) - 1;
}

function sine(phase) {
  return Math.sin(2 * Math.PI * phase);
}

const signalPresets = {
  enable: { notes: [392, 523.25, 659.25], duration: 0.38, gain: 0.062, step: 0.045 },
  press: { notes: [392, 440], duration: 0.15, gain: 0.032, step: 0.018 },
  select: { notes: [440, 587.33], duration: 0.22, gain: 0.041, step: 0.034 },
  open: { notes: [349.23, 466.16, 587.33], duration: 0.3, gain: 0.047, step: 0.04 },
  close: { notes: [587.33, 440, 349.23], duration: 0.25, gain: 0.039, step: 0.032 },
  navigate: { notes: [392, 523.25], duration: 0.22, gain: 0.04, step: 0.04 },
};

function renderSignal(kind) {
  const preset = signalPresets[kind];
  const tail = 0.02;
  const length = Math.ceil((preset.duration + tail) * SAMPLE_RATE);
  const data = new Float64Array(length);
  const glide = kind === 'close' ? 0.985 : 1.018;

  preset.notes.forEach((frequency, index) => {
    const partial = index === 0 ? 0.82 : 0.26 / index;
    const startSample = Math.floor(index * preset.step * SAMPLE_RATE);
    const glideSamples = Math.max(1, Math.floor(preset.duration * 0.72 * SAMPLE_RATE));
    let phase = 0;
    for (let sample = startSample; sample < length; sample += 1) {
      const progress = Math.min(1, (sample - startSample) / glideSamples);
      const current = frequency * glide ** progress;
      phase += current / SAMPLE_RATE;
      data[sample] += partial * (index === 0 ? sine(phase) : triangle(phase));
    }
  });

  const attack = Math.max(1, Math.floor(0.012 * SAMPLE_RATE));
  const decayEnd = Math.floor(preset.duration * SAMPLE_RATE);
  for (let sample = 0; sample < length; sample += 1) {
    let envelope;
    if (sample < attack) envelope = 0.0001 * (preset.gain / 0.0001) ** (sample / attack);
    else if (sample < decayEnd) envelope = preset.gain * (0.0001 / preset.gain) ** ((sample - attack) / Math.max(1, decayEnd - attack));
    else envelope = 0;
    data[sample] *= envelope;
  }
  return data;
}

function crossfadeLoop(data, fadeSeconds) {
  const fade = Math.floor(fadeSeconds * SAMPLE_RATE);
  const length = data.length - fade;
  const looped = new Float64Array(length);
  looped.set(data.subarray(0, length));
  for (let index = 0; index < fade; index += 1) {
    const position = index / fade;
    const head = Math.cos((position * Math.PI) / 2);
    const tail = Math.sin((position * Math.PI) / 2);
    looped[index] = looped[index] * head + data[length + index] * tail;
  }
  return looped;
}

function renderHearth(seconds) {
  const random = mulberry32(0x48454152);
  const total = Math.ceil(seconds * SAMPLE_RATE);
  const raw = new Float64Array(total);
  const bed = brownNoise(total, random);
  const texture = brownNoise(total, random);
  const bedLowpass = biquad('lowpass', 430, 0.42);
  const bedHighpass = biquad('highpass', 48, 0.7071);
  const textureBandpass = biquad('bandpass', 760, 0.48);

  for (let sample = 0; sample < total; sample += 1) {
    const time = sample / SAMPLE_RATE;
    const bedGain = 0.027 + 0.006 * Math.sin(2 * Math.PI * 0.11 * time);
    const textureGain = 0.007 + 0.0025 * Math.sin(2 * Math.PI * 0.067 * time);
    const textureSample = texture[Math.min(total - 1, Math.floor(sample * TEXTURE_PLAYBACK_RATE))];
    raw[sample] = bedHighpass(bedLowpass(bed[sample])) * bedGain + textureBandpass(textureSample) * textureGain;
  }

  let cursor = 0.62;
  while (cursor < seconds) {
    const chance = random();
    const count = chance < 0.16 ? 3 : chance < 0.42 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const kind = index === 0 && random() < 0.34 ? 'wood' : 'snap';
      const offset = cursor + (index * (55 + random() * 150)) / 1000;
      const duration = kind === 'snap' ? 0.014 + random() * 0.036 : 0.075 + random() * 0.12;
      const filter = biquad(
        kind === 'snap' ? 'bandpass' : 'lowpass',
        kind === 'snap' ? 1100 + random() * 2300 : 480 + random() * 720,
        kind === 'snap' ? 0.85 + random() * 0.8 : 0.35,
      );
      const level = kind === 'snap' ? 0.01 + random() * 0.019 : 0.006 + random() * 0.011;
      const start = Math.floor(offset * SAMPLE_RATE);
      const span = Math.ceil(duration * SAMPLE_RATE);
      for (let step = 0; step < span; step += 1) {
        const target = start + step;
        if (target >= total) break;
        const progress = step / span;
        const attack = Math.min(1, progress / 0.045);
        const decay = (1 - progress) ** (kind === 'snap' ? 3.8 : 2.1);
        const grain = kind === 'wood' ? 0.58 + 0.42 * Math.sin(step * 0.19) : 1;
        raw[target] += filter((random() * 2 - 1) * attack * decay * grain) * level;
      }
    }
    cursor += (780 + random() * 3900) / 1000;
  }
  return crossfadeLoop(raw, 0.9);
}

function renderSpaceflight(seconds) {
  const random = mulberry32(0x53504143);
  const total = Math.ceil(seconds * SAMPLE_RATE);
  const raw = new Float64Array(total);
  const voices = [
    { frequency: 43.65, gain: 0.05, drift: 1.4 },
    { frequency: 65.41, gain: 0.021, drift: 2.1 },
    { frequency: 87.31, gain: 0.009, drift: 2.8 },
    { frequency: 130.81, gain: 0.004, drift: 3.8 },
    { frequency: 196.31, gain: 0.002, drift: 4.6 },
  ];
  const detune = [-3, 2, -5, 7, -8];

  voices.forEach((voice, index) => {
    let phase = 0;
    for (let sample = 0; sample < total; sample += 1) {
      const time = sample / SAMPLE_RATE;
      const cents = detune[index] + voice.drift * Math.sin(2 * Math.PI * (0.004 + index * 0.0017) * time);
      const frequency = voice.frequency * 2 ** (cents / 1200);
      phase += frequency / SAMPLE_RATE;
      raw[sample] += (index === 1 ? triangle(phase) : sine(phase)) * voice.gain;
    }
  });

  const wash = brownNoise(total, random);
  const washLowpass = biquad('lowpass', 118, 0.2);
  const washHighpass = biquad('highpass', 24, 0.7071);
  for (let sample = 0; sample < total; sample += 1) {
    raw[sample] += washHighpass(washLowpass(wash[sample])) * 0.0045;
  }

  const bloomFrequencies = [207.65, 233.08, 293.66, 311.13];
  const bloomStart = Math.floor(seconds * BLOOM_START_FRACTION * SAMPLE_RATE);
  const bloomFrequency = bloomFrequencies[Math.floor(random() * bloomFrequencies.length)];
  let bloomPhase = 0;
  for (let sample = bloomStart; sample < total; sample += 1) {
    const progress = (sample - bloomStart) / (total - bloomStart);
    bloomPhase += bloomFrequency / SAMPLE_RATE;
    raw[sample] += sine(bloomPhase) * 0.0032 * Math.sin(Math.PI * progress);
  }
  return crossfadeLoop(raw, 1.2);
}

function normalize(data, peak) {
  let maximum = 0;
  for (const sample of data) maximum = Math.max(maximum, Math.abs(sample));
  const scale = maximum > 0 ? peak / maximum : 1;
  return { data, scale };
}

function encodeWav(data, scale) {
  const header = Buffer.alloc(44);
  const body = Buffer.alloc(data.length * 2);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + body.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(body.length, 40);
  for (let index = 0; index < data.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, data[index] * scale));
    body.writeInt16LE(Math.round(clamped * 32767), index * 2);
  }
  return Buffer.concat([header, body]);
}

mkdirSync(outDir, { recursive: true });

const signals = Object.keys(signalPresets).map(kind => ({ kind, data: renderSignal(kind) }));
let signalPeak = 0;
for (const signal of signals) {
  for (const sample of signal.data) signalPeak = Math.max(signalPeak, Math.abs(sample));
}
const signalScale = signalPeak > 0 ? 0.85 / signalPeak : 1;

const written = [];
for (const signal of signals) {
  const file = resolve(outDir, `signal-${signal.kind}.wav`);
  writeFileSync(file, encodeWav(signal.data, signalScale));
  written.push(file);
}

for (const [name, data] of [['ambience-hearth', renderHearth(11)], ['ambience-spaceflight', renderSpaceflight(13)]]) {
  const normalized = normalize(data, 0.72);
  const file = resolve(outDir, `${name}.wav`);
  writeFileSync(file, encodeWav(normalized.data, normalized.scale));
  written.push(file);
}

for (const file of written) console.log(`gerado: ${file.replace(`${repoRoot}/`, '')}`);
