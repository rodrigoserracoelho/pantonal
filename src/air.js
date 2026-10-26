/* global Tone */
import { mtof } from './music.js';

// Air Thinker: a theremin played with the hands in front of the camera.
// Hand tracking (MediaPipe, vendor/mediapipe) runs entirely in the browser:
// the video never leaves the device and nothing is recorded.

export const AIR_LOW = 48; // C3, hand at the bottom
export const AIR_HIGH = 84; // C6, hand at the top
// The vertical part of the camera image mapped to the range: set from the
// part of the image visible on screen, so the whole range is always in view.
let band = [0.15, 0.85];
const TRACE_SECONDS = 6;

const WRIST = 0;
const PALM = 9; // base of the middle finger: steadier than a fingertip
const FINGERTIPS = [8, 12, 16, 20];

// Scales the pitch can snap to: pitch classes above the key, grouped as the
// scale menu shows them. Free glides through every pitch, like a real theremin.
// Makams and ragas are played as their notes in 12-tone tuning, so only those
// that keep their character there are listed; for ragas the key is Sa.
export const SCALES = {
  free: { group: 'Scales', label: 'Free', notes: null },
  chromatic: { group: 'Scales', label: 'Chromatic', notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { group: 'Scales', label: 'Major', notes: [0, 2, 4, 5, 7, 9, 11] },
  major_pentatonic: { group: 'Scales', label: 'Major Pentatonic', notes: [0, 2, 4, 7, 9] },
  minor_pentatonic: { group: 'Scales', label: 'Minor Pentatonic', notes: [0, 3, 5, 7, 10] },
  japanese_in: { group: 'Scales', label: 'Japanese In', notes: [0, 1, 5, 7, 8] },
  natural_minor: { group: 'Minor', label: 'Natural', notes: [0, 2, 3, 5, 7, 8, 10] },
  harmonic_minor: { group: 'Minor', label: 'Harmonic', notes: [0, 2, 3, 5, 7, 8, 11] },
  melodic_minor: { group: 'Minor', label: 'Melodic', notes: [0, 2, 3, 5, 7, 9, 11] }, // ascending form
  hungarian_minor: { group: 'Minor', label: 'Hungarian', notes: [0, 2, 3, 6, 7, 8, 11] },
  neapolitan_minor: { group: 'Minor', label: 'Neapolitan', notes: [0, 1, 3, 5, 7, 8, 11] },
  dorian: { group: 'Modes', label: 'Dorian', notes: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { group: 'Modes', label: 'Phrygian', notes: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { group: 'Modes', label: 'Lydian', notes: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { group: 'Modes', label: 'Mixolydian', notes: [0, 2, 4, 5, 7, 9, 10] },
  locrian: { group: 'Modes', label: 'Locrian', notes: [0, 1, 3, 5, 6, 8, 10] },
  hicaz: { group: 'Turkish makams', label: 'Hicaz', notes: [0, 1, 4, 5, 7, 8, 10] },
  hicazkar: { group: 'Turkish makams', label: 'Hicazkar', notes: [0, 1, 4, 5, 7, 8, 11] },
  kurdi: { group: 'Turkish makams', label: 'Kürdi', notes: [0, 1, 3, 5, 7, 8, 10] },
  nikriz: { group: 'Turkish makams', label: 'Nikriz', notes: [0, 2, 3, 6, 7, 9, 10] },
  suzinak: { group: 'Turkish makams', label: 'Suzinak', notes: [0, 2, 4, 5, 7, 8, 11] },
  yaman: { group: 'Indian ragas', label: 'Yaman', notes: [0, 2, 4, 6, 7, 9, 11] },
  bhairav: { group: 'Indian ragas', label: 'Bhairav', notes: [0, 1, 4, 5, 7, 8, 11] },
  bhairavi: { group: 'Indian ragas', label: 'Bhairavi', notes: [0, 1, 3, 5, 7, 8, 10] },
  todi: { group: 'Indian ragas', label: 'Todi', notes: [0, 1, 3, 6, 7, 8, 11] },
  purvi: { group: 'Indian ragas', label: 'Purvi', notes: [0, 1, 4, 6, 7, 8, 11] },
  marwa: { group: 'Indian ragas', label: 'Marwa', notes: [0, 1, 4, 6, 9, 11] }, // no Pa
  malkauns: { group: 'Indian ragas', label: 'Malkauns', notes: [0, 3, 5, 8, 10] },
  hamsadhwani: { group: 'Indian ragas', label: 'Hamsadhwani', notes: [0, 2, 4, 7, 11] },
};
// A short fact per scale for the scale menu.
export const SCALE_FACTS = {
  free: 'A real theremin has no keys or frets: players find every note by ear.',
  chromatic: 'All 12 notes, each a semitone apart: every white and black key of a piano.',
  major: 'The bright "happy" scale of countless songs, from "Twinkle, Twinkle" to "Ode to Joy".',
  major_pentatonic: 'Five notes that never clash, found in folk music all over the world. The black keys of a piano form one.',
  minor_pentatonic: 'The backbone of blues and rock guitar solos.',
  japanese_in: 'A traditional Japanese scale, heard in music for the koto.',
  natural_minor: 'The darker sister of major: the same notes as a major scale, starting from its 6th note.',
  harmonic_minor: 'Raising the 7th note gives minor a strong pull back home. Bach and Mozart used it all the time.',
  melodic_minor: 'Classical musicians raise the 6th and 7th notes going up; jazz players keep them raised both ways.',
  hungarian_minor: 'Also called "Gypsy minor". Franz Liszt used its sound in his Hungarian Rhapsodies.',
  neapolitan_minor: 'Named after the opera composers of 18th-century Naples.',
  dorian: 'Minor with a bright 6th note: the old English song "Scarborough Fair" uses it.',
  phrygian: 'Its dark, low 2nd note gives the sound of Spanish flamenco.',
  lydian: 'Major with a raised 4th: dreamy and floating. The Simpsons theme uses it.',
  mixolydian: 'Major with a lowered 7th, heard in lots of rock and folk, like the Beatles\' "Norwegian Wood".',
  locrian: 'The rarest mode: its home chord is so unstable that it is hard to end a tune on it.',
  hicaz: 'One of the best-known makams, also heard in Greek and Arabic music (as Hitzaz and Hijaz).',
  hicazkar: 'A more dramatic relative of Hicaz, from Ottoman classical music.',
  kurdi: 'Its name means "Kurdish". It has a dark, minor sound.',
  nikriz: 'It has Hicaz\'s wide step, higher up. Klezmer musicians know the same notes as "Mi sheberakh".',
  suzinak: 'Two moods in one: it starts bright like makam Rast and ends like Hicaz.',
  yaman: 'An evening raga, often one of the first ragas students learn in North India.',
  bhairav: 'A sunrise raga, named after Bhairava, a fierce form of the god Shiva.',
  bhairavi: 'A morning raga that often closes a concert. It uses all four "flat" notes.',
  todi: 'A morning raga with a serious, haunting mood.',
  purvi: 'A sunset raga. Its name means "eastern".',
  marwa: 'A sunset raga with a restless mood. It skips Pa, the fifth note.',
  malkauns: 'A deep, meditative five-note raga for late at night.',
  hamsadhwani: 'A South Indian (Carnatic) raga. Its name means "the cry of the swan".',
};

export const KEY_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// The note of the scale nearest to `midi`. No scale has a gap wider than four
// semitones, so looking six either way always finds one.
export function snapToScale(midi, notes, key) {
  let best = null;
  for (let m = Math.floor(midi) - 6; m <= Math.ceil(midi) + 6; m++) {
    const inScale = notes.includes((((m - key) % 12) + 12) % 12);
    if (inScale && (best === null || Math.abs(m - midi) < Math.abs(best - midi))) best = m;
  }
  return best;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function setBand(top, bottom) {
  band = [top, bottom];
}

// 0 at the bottom of the band, 1 at the top.
export const heightOf = (y) => clamp01((band[1] - y) / (band[1] - band[0]));
export const yOfHeight = (h) => band[1] - h * (band[1] - band[0]);

// Fingertips far from the wrist, relative to the hand's size, mean an open hand.
const openness = (hand) => FINGERTIPS.reduce((sum, i) => sum + dist(hand[i], hand[WRIST]), 0)
  / FINGERTIPS.length / dist(hand[PALM], hand[WRIST]);

let landmarkerPromise = null;

function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, HandLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks(new URL('../vendor/mediapipe/wasm', import.meta.url).href);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('../vendor/mediapipe/hand_landmarker.task', import.meta.url).href, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    try {
      return await HandLandmarker.createFromOptions(vision, options('GPU'));
    } catch {
      return HandLandmarker.createFromOptions(vision, options('CPU'));
    }
  })();
  landmarkerPromise.catch(() => (landmarkerPromise = null)); // allow a retry
  return landmarkerPromise;
}

// The theremin voice: a warm, slightly reedy tone with vibrato on its pitch.
function createVoice() {
  const limiter = new Tone.Limiter(-3).toDestination();
  const reverb = new Tone.Reverb({ decay: 2, wet: 0.2 }).connect(limiter);
  const gain = new Tone.Gain(0).connect(reverb);
  const osc = new Tone.Oscillator({ type: 'custom', partials: [1, 0.22, 0.09, 0.04], frequency: mtof(60) }).connect(gain);
  const vibrato = new Tone.LFO({ frequency: 5.5, min: -25, max: 25 }).connect(osc.detune);
  return { osc, gain, vibrato };
}

export function createAir() {
  const air = {
    running: false,
    video: null,
    hands: [], // landmarks of the latest frame, mirrored like a mirror image
    pitchHand: null,
    volumeHand: null,
    open: false,
    pitch: null, // the midi note being played (fractional unless snapped)
    volume: 1,
    trace: [], // { t, midi }; midi is null while silent
    scale: null, // pitch classes (above `key`) the pitch snaps to; null glides freely
    key: 0,
    sounding: false, // the hand is playing (and no phrase is)
  };

  let voice = null;
  let landmarker = null;
  let stream = null;
  let lastFrameTime = -1;
  let smoothed = null;
  let phraseUntil = 0; // while a phrase plays, the hand stays silent

  // The oscillator starts on first use and then keeps running, silent when
  // nothing plays, so phrases and the hand can share it freely.
  function ensureVoice() {
    voice ??= createVoice();
    if (voice.osc.state !== 'started') {
      voice.osc.start();
      voice.vibrato.start();
    }
  }

  // Plays `midis` one after another, `noteSeconds` each, in the theremin voice:
  // as separate notes with a short slide between them, or as one continuous
  // glide. Returns how long it lasts, in seconds.
  air.playPhrase = (midis, noteSeconds, { glide = false } = {}) => {
    ensureVoice();
    const freq = voice.osc.frequency;
    const gain = voice.gain.gain;
    const t0 = Tone.now() + 0.05;
    const end = t0 + midis.length * noteSeconds;
    freq.cancelScheduledValues(t0);
    gain.cancelScheduledValues(t0);
    freq.setValueAtTime(mtof(midis[0]), t0);
    gain.setValueAtTime(0, t0);
    gain.linearRampToValueAtTime(0.5, t0 + 0.05);
    midis.forEach((midi, i) => {
      if (!i) return;
      const t = t0 + i * noteSeconds;
      if (glide) {
        freq.exponentialRampToValueAtTime(mtof(midi), t);
      } else {
        freq.setValueAtTime(mtof(midis[i - 1]), t - 0.04);
        freq.exponentialRampToValueAtTime(mtof(midi), t);
        gain.setValueAtTime(0.5, t - 0.08);
        gain.linearRampToValueAtTime(0.18, t - 0.02);
        gain.linearRampToValueAtTime(0.5, t + 0.04);
      }
    });
    gain.setValueAtTime(0.5, end - 0.1);
    gain.linearRampToValueAtTime(0, end + 0.1);
    phraseUntil = performance.now() / 1000 + (end - t0) + 0.25;
    return end - t0;
  };
  air.setVibrato = (depthCents, rate) => {
    if (!voice) return;
    voice.vibrato.min = -depthCents;
    voice.vibrato.max = depthCents;
    voice.vibrato.frequency.value = rate;
  };

  air.start = async (vibrato) => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') throw new Error('The camera is blocked. Allow camera access for this site and press Play again.');
      if (err.name === 'NotFoundError') throw new Error('No camera was found on this device.');
      throw new Error('The camera could not be started.');
    }
    air.video ??= Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    air.video.srcObject = stream;
    await air.video.play();

    try {
      landmarker = await loadLandmarker();
    } catch {
      air.stop();
      throw new Error('Hand tracking could not be loaded on this device.');
    }

    ensureVoice();
    air.setVibrato(vibrato.depth, vibrato.rate);
    air.running = true;
    smoothed = null;
    requestAnimationFrame(loop);
  };

  air.stop = () => {
    air.running = false;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    voice?.gain.gain.rampTo(0, 0.1);
    air.sounding = false;
    air.hands = [];
    air.pitchHand = air.volumeHand = null;
    air.pitch = null;
    air.trace = [];
  };

  function loop() {
    if (!air.running) return;
    const video = air.video;
    if (video.readyState >= 2 && video.currentTime !== lastFrameTime) {
      lastFrameTime = video.currentTime;
      track(landmarker.detectForVideo(video, performance.now()));
    }
    requestAnimationFrame(loop);
  }

  function track(result) {
    const now = performance.now() / 1000;
    air.hands = result.landmarks.map((points) => points.map((p) => ({ x: 1 - p.x, y: p.y })));

    // Like a real theremin: the hand on the right plays the pitch, the other
    // (if any) sets the volume.
    const byX = [...air.hands].sort((a, b) => b[PALM].x - a[PALM].x);
    air.pitchHand = byX[0] ?? null;
    air.volumeHand = byX[1] ?? null;

    if (air.pitchHand) {
      const o = openness(air.pitchHand);
      air.open = air.open ? o > 1.25 : o > 1.45; // hysteresis: no flicker at the edge
      const target = AIR_LOW + heightOf(air.pitchHand[PALM].y) * (AIR_HIGH - AIR_LOW);
      // Light smoothing removes tracking jitter but keeps hand-shake vibrato.
      smoothed = smoothed === null ? target : smoothed + (target - smoothed) * 0.45;
      air.pitch = air.scale ? snapToScale(smoothed, air.scale, air.key) : smoothed;
    } else {
      air.open = false;
      smoothed = null;
    }
    air.volume = air.volumeHand ? 0.15 + 0.85 * heightOf(air.volumeHand[PALM].y) : 1;

    const sounding = Boolean(air.pitchHand && air.open) && now >= phraseUntil;
    if (now >= phraseUntil) {
      if (sounding) voice.osc.frequency.rampTo(mtof(air.pitch), 0.04);
      voice.gain.gain.rampTo(sounding ? 0.6 * air.volume : 0, sounding ? 0.06 : 0.12);
    }
    air.sounding = sounding;

    air.trace.push({ t: now, midi: sounding ? air.pitch : null });
    while (air.trace.length && air.trace[0].t < now - TRACE_SECONDS) air.trace.shift();
  }

  air.traceSeconds = TRACE_SECONDS;
  return air;
}
