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
    snap: false,
  };

  let voice = null;
  let landmarker = null;
  let stream = null;
  let lastFrameTime = -1;
  let smoothed = null;

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

    voice ??= createVoice();
    air.setVibrato(vibrato.depth, vibrato.rate);
    voice.osc.start();
    voice.vibrato.start();
    air.running = true;
    smoothed = null;
    requestAnimationFrame(loop);
  };

  air.stop = () => {
    air.running = false;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (voice) {
      voice.gain.gain.rampTo(0, 0.1);
      voice.osc.stop('+0.15');
      voice.vibrato.stop('+0.15');
    }
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
      air.pitch = air.snap ? Math.round(smoothed) : smoothed;
    } else {
      air.open = false;
      smoothed = null;
    }
    air.volume = air.volumeHand ? 0.15 + 0.85 * heightOf(air.volumeHand[PALM].y) : 1;

    const sounding = Boolean(air.pitchHand && air.open);
    if (sounding) voice.osc.frequency.rampTo(mtof(air.pitch), 0.04);
    voice.gain.gain.rampTo(sounding ? 0.6 * air.volume : 0, sounding ? 0.06 : 0.12);

    air.trace.push({ t: now, midi: sounding ? air.pitch : null });
    while (air.trace.length && air.trace[0].t < now - TRACE_SECONDS) air.trace.shift();
  }

  air.traceSeconds = TRACE_SECONDS;
  return air;
}
