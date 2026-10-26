/* global Tone */
import { mtof } from './music.js';

// Drones to improvise over in Air Thinker, following the key and scale: a
// tanpura for ragas, the home note held by a ney (dem) for makams, and the home note
// with its fifth, like a shruti box, for the rest. Ragas with Pa use a real
// tanpura recording (samples/tanpura, Sa = C#3), sped up or slowed down to the
// key; the others, and ragas tuned to Ma or Ni, are synthesized.

const TANPURA_RECORDING = 'samples/tanpura/tanpura-cs3.flac';
const RECORDING_SA = 49; // C#3

const TANPURA_PLUCKS = [0, 0.95, 1.6, 2.25]; // seconds into each cycle
const TANPURA_CYCLE = 3.8;

export const droneKind = (group) => ({ ragas: 'tanpura', makams: 'dem' }[group] ?? 'shruti');

// The tanpura's first string: Pa, or Ma or Ni for ragas that skip Pa.
export function tanpuraFirstString(notes) {
  if (notes.includes(7)) return 'Pa';
  return notes.includes(5) ? 'Ma' : 'Ni';
}
const FIRST_STRING_BELOW_SA = { Pa: 5, Ma: 7, Ni: 1 };

export function createDrone() {
  const drone = { playing: false };
  let output = null;
  let tanpura = null;
  let sustained = [];
  let timer = null;
  let volume = 0.5;
  let recording = null; // ToneAudioBuffer, loaded on first use
  let recordingReady = null; // resolves to whether it loaded
  let player = null;
  let request = 0; // only the latest start() may start sounds

  function ensureOutput() {
    if (output) return;
    const limiter = new Tone.Limiter(-6).toDestination();
    const reverb = new Tone.Reverb({ decay: 3.5, wet: 0.3 }).connect(limiter);
    output = new Tone.Gain(volume).connect(reverb);
    // A bright plucked string whose resonant filter blooms upwards after each
    // pluck, like the buzz of the tanpura's bridge (jawari).
    const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3, depth: 0.4, wet: 0.35 }).connect(output).start();
    tanpura = new Tone.PolySynth(Tone.MonoSynth, {
      maxPolyphony: 16,
      volume: 4,
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.004, decay: 5, sustain: 0, release: 1.5 },
      filter: { type: 'lowpass', Q: 7, rolloff: -24 },
      filterEnvelope: { attack: 1.6, decay: 3.5, sustain: 0.3, release: 1.5, baseFrequency: 180, octaves: 4.2, exponent: 2 },
    }).connect(chorus);
  }

  // A held note that breathes slowly; fades in, and out when stopped.
  function sustain(midi, level, breathRate) {
    const fade = new Tone.Gain(0).connect(output);
    const breath = new Tone.Gain(1).connect(fade);
    const filter = new Tone.Filter(900, 'lowpass').connect(breath);
    const osc = new Tone.Oscillator({ type: 'custom', partials: [1, 0.5, 0.33, 0.22, 0.12, 0.08], frequency: mtof(midi) })
      .connect(filter).start();
    const lfo = new Tone.LFO({ frequency: breathRate, min: 0.7, max: 1 }).connect(breath.gain).start();
    fade.gain.rampTo(level, 1.5);
    return () => {
      fade.gain.rampTo(0, 1.2);
      setTimeout(() => [osc, lfo, filter, breath, fade].forEach((node) => node.dispose()), 1600);
    };
  }

  // A ney-like held note: a soft flute tone with a little natural pitch
  // wander, wrapped in breath (noise around the note) and a faint high hiss,
  // swelling slowly like a player's breathing.
  function ney(midi, level, breathRate) {
    const fade = new Tone.Gain(0).connect(output);
    const breath = new Tone.Gain(1).connect(fade);
    const tone = new Tone.Oscillator({ type: 'custom', partials: [1, 0.3, 0.12, 0.06, 0.03], frequency: mtof(midi) })
      .connect(breath).start();
    const wander = new Tone.LFO({ frequency: 0.21, min: -4, max: 4 }).connect(tone.detune).start();
    const noise = new Tone.Noise('pink').start();
    const air = new Tone.Filter({ type: 'bandpass', frequency: mtof(midi) * 2, Q: 2 });
    const airLevel = new Tone.Gain(0.25);
    const hiss = new Tone.Filter({ type: 'highpass', frequency: 3000 });
    const hissLevel = new Tone.Gain(0.03);
    noise.connect(air);
    noise.connect(hiss);
    air.chain(airLevel, breath);
    hiss.chain(hissLevel, breath);
    const swell = new Tone.LFO({ frequency: breathRate, min: 0.55, max: 1 }).connect(breath.gain).start();
    fade.gain.rampTo(level, 2.5);
    return () => {
      fade.gain.rampTo(0, 1.2);
      setTimeout(() => [tone, wander, noise, air, airLevel, hiss, hissLevel, swell, breath, fade]
        .forEach((node) => node.dispose()), 1600);
    };
  }

  function silence() {
    clearTimeout(timer);
    tanpura?.releaseAll();
    if (player) {
      const old = player;
      old.stop();
      setTimeout(() => old.dispose(), 1600);
      player = null;
    }
    sustained.forEach((stop) => stop());
    sustained = [];
  }

  drone.setVolume = (value) => {
    volume = value;
    output?.gain.rampTo(value, 0.2);
  };

  // Starts, or retunes, the drone for a scale: its group, pitch classes
  // (null for Free) and key. Sa / the home note sits between C3 and B3.
  drone.start = async ({ group, notes, key }) => {
    ensureOutput();
    silence();
    drone.playing = true;
    const current = ++request;
    const sa = 48 + key;
    const kind = droneKind(group);

    if (kind === 'tanpura' && tanpuraFirstString(notes) === 'Pa') {
      // The recording's Sa moves to the key, at most about six semitones, so
      // its plucking never sounds unnaturally fast or slow.
      recordingReady ??= new Promise((resolve) => {
        recording = new Tone.ToneAudioBuffer(TANPURA_RECORDING, () => resolve(true), () => resolve(false));
      });
      const loaded = await recordingReady;
      if (current !== request) return; // stopped or retuned meanwhile
      if (loaded) {
        const target = sa - RECORDING_SA > 6 ? sa - 12 : sa;
        player = new Tone.Player({ url: recording, loop: true, fadeIn: 0.8, fadeOut: 1.2, volume: 2 }).connect(output);
        player.playbackRate = 2 ** ((target - RECORDING_SA) / 12);
        player.start();
        return;
      }
    }

    if (kind === 'tanpura') {
      const strings = [sa - FIRST_STRING_BELOW_SA[tanpuraFirstString(notes)], sa, sa, sa - 12];
      let cycleStart = Tone.now() + 0.1;
      const cycle = () => {
        TANPURA_PLUCKS.forEach((offset, i) => {
          tanpura.triggerAttackRelease(mtof(strings[i]), 5.5, cycleStart + offset, i === 3 ? 0.9 : 0.75);
        });
        cycleStart += TANPURA_CYCLE;
        timer = setTimeout(cycle, Math.max(0, (cycleStart - Tone.now() - 0.5) * 1000));
      };
      cycle();
    } else if (kind === 'dem') {
      // A ney holding the home note, a quieter one an octave up, and a soft hum below.
      sustained = [ney(sa, 0.34, 0.09), ney(sa + 12, 0.1, 0.11), sustain(sa - 12, 0.16, 0.07)];
    } else {
      sustained = [sustain(sa - 12, 0.32, 0.11), sustain(sa, 0.26, 0.14), sustain(sa + 7, 0.2, 0.17)];
    }
  };

  drone.stop = () => {
    drone.playing = false;
    request++;
    silence();
  };

  return drone;
}
