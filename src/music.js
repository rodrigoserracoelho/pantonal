/* global Tone */

// Every instrument a session can use. `samples` is its folder under samples/
// (sources and licenses in samples/CREDITS.md), `icon` an entry in icons.js,
// `program` the General MIDI program used when exporting, and `loop` (seconds
// into the ~3 s recordings) sustains long notes of instruments that don't
// die away on their own.
const SUSTAIN = [0.5, 2.5];
export const LIBRARY = {
  piano: { label: 'Piano', family: 'Keys', icon: 'piano', program: 1, samples: 'piano', naming: 'salamander', release: 1 },
  celesta: { label: 'Celesta', family: 'Keys', icon: 'bells', program: 9, samples: 'celesta', release: 1 },
  music_box: { label: 'Music box', family: 'Keys', icon: 'bells', program: 11, samples: 'music_box', release: 1 },
  church_organ: { label: 'Organ', family: 'Keys', icon: 'organ', program: 20, samples: 'church_organ', release: 0.5, loop: SUSTAIN },
  accordion: { label: 'Accordion', family: 'Keys', icon: 'organ', program: 22, samples: 'accordion', release: 0.4, loop: SUSTAIN },
  marimba: { label: 'Marimba', family: 'Percussion', icon: 'mallets', program: 13, samples: 'marimba', release: 0.6 },
  xylophone: { label: 'Xylophone', family: 'Percussion', icon: 'mallets', program: 14, samples: 'xylophone', release: 0.4 },
  vibraphone: { label: 'Vibraphone', family: 'Percussion', icon: 'mallets', program: 12, samples: 'vibraphone', release: 1.2 },
  kalimba: { label: 'Kalimba', family: 'Percussion', icon: 'mallets', program: 109, samples: 'kalimba', release: 0.6 },
  steel_drums: { label: 'Steel drums', family: 'Percussion', icon: 'drum', program: 115, samples: 'steel_drums', release: 0.6 },
  guitar: { label: 'Guitar', family: 'Strings', icon: 'guitar', program: 25, samples: 'acoustic_guitar_nylon', release: 0.8 },
  harp: { label: 'Harp', family: 'Strings', icon: 'harp', program: 47, samples: 'orchestral_harp', release: 1.2 },
  violin: { label: 'Violin', family: 'Strings', icon: 'strings', program: 41, samples: 'violin', attack: 0.03, release: 0.5, loop: SUSTAIN },
  cello: { label: 'Cello', family: 'Strings', icon: 'strings', program: 43, samples: 'cello', attack: 0.05, release: 0.6, loop: SUSTAIN },
  strings: { label: 'Strings', family: 'Strings', icon: 'strings', program: 49, samples: 'string_ensemble_1', attack: 0.08, release: 0.8, loop: SUSTAIN },
  pizzicato: { label: 'Pizzicato', family: 'Strings', icon: 'strings', program: 46, samples: 'pizzicato_strings', release: 0.4 },
  chorus: { label: 'Chorus', family: 'Voices', icon: 'chorus', program: 53, samples: 'choir', attack: 0.05, release: 0.8, loop: SUSTAIN },
  flute: { label: 'Flute', family: 'Winds', icon: 'flute', program: 74, samples: 'flute', release: 0.4, loop: SUSTAIN },
  pan_flute: { label: 'Pan flute', family: 'Winds', icon: 'flute', program: 76, samples: 'pan_flute', release: 0.4, loop: SUSTAIN },
  oboe: { label: 'Oboe', family: 'Winds', icon: 'reed', program: 69, samples: 'oboe', release: 0.4, loop: SUSTAIN },
  clarinet: { label: 'Clarinet', family: 'Winds', icon: 'reed', program: 72, samples: 'clarinet', release: 0.4, loop: SUSTAIN },
  trumpet: { label: 'Trumpet', family: 'Brass', icon: 'brass', program: 57, samples: 'trumpet', release: 0.4, loop: SUSTAIN },
  french_horn: { label: 'French horn', family: 'Brass', icon: 'brass', program: 61, samples: 'french_horn', release: 0.5, loop: SUSTAIN },
};

export const DEFAULT_INSTRUMENTS = ['piano', 'chorus', 'flute'];
export const MAX_INSTRUMENTS = 6;
// Layer colours, handed to a session's instruments as they are added.
export const COLORS = ['#2fb9d3', '#c98fc4', '#f2a35e', '#6cbf6a', '#e36b6b', '#8a8ee8'];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const midiName = (midi) => NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
export const isBlackKey = (midi) => [1, 3, 6, 8, 10].includes(midi % 12);
export const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function noteToMidi(name) {
  const [, letter, accidental, octave] = name.match(/^([A-G])(#|b)?(-?\d)$/);
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return NOTE_NAMES.indexOf(letter) + offset + (Number(octave) + 1) * 12;
}

// Chromatic Thinker's canvas always spans C0 to B8; the Octaves setting only
// sets how much of it fits on screen.
export const PITCH_RANGE = { low: 12, high: 119, rows: 108 };

// Row 0 is the top of the canvas, i.e. the highest pitch.
export const rowToMidi = (row, range) => range.high - row;
export const midiToRow = (midi, range) => range.high - midi;

// Free Thinker: continuous pitch from C2 (bottom) to C6 (top), and a fine time
// grid so glides follow the line closely.
export const FREE_COLS = 200;
const FREE_LOW = 36;
const FREE_HIGH = 84;
export const freeMidi = (y) => FREE_HIGH - y * (FREE_HIGH - FREE_LOW);

// A stroke segment steeper than this (|dy| / |dx| on screen, ~63°) is a cluster.
const CLUSTER_STEEPNESS = 2;

const clampCell = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

// Walks a stroke in drawing order and groups its samples into visits, one per
// pass through a column. Samples on steep segments are cluster samples, the
// rest melody samples. `cols` is columns per x unit (one screen), `totalCols`
// the length of the piece, and `aspect` the px width / height of the units.
function strokeVisits(points, cols, sampleStep, aspect, totalCols = cols) {
  const visits = [];
  let visit = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[i + 1] ?? a;
    const dx = Math.abs(b.x - a.x) * aspect;
    const dy = Math.abs(b.y - a.y);
    const steep = dy > 0 && dy > CLUSTER_STEEPNESS * dx;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / sampleStep));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const col = Math.min(totalCols - 1, Math.max(0, Math.floor((a.x + (b.x - a.x) * t) * cols)));
      if (visit?.col !== col) visits.push((visit = { col, flat: [], steep: [] }));
      (steep ? visit.steep : visit.flat).push(a.y + (b.y - a.y) * t);
    }
  }
  return visits;
}

// Chromatic Thinker: turn strokes into notes. Steep parts of a stroke sound
// every row they cross (a cluster); flatter parts play one note per pass
// through a column, at the stroke's average height there. Consecutive cells of
// the same row within one stroke merge into one held note. `cols` is columns
// per screen; the piece is `totalCols` long.
export function quantize(strokes, cols, rows, aspect = 1, totalCols = cols) {
  const notes = new Map();
  const sampleStep = 0.25 / Math.max(cols, rows);

  for (const stroke of strokes) {
    const cells = new Set();
    for (const { col, flat, steep } of strokeVisits(stroke.points, cols, sampleStep, aspect, totalCols)) {
      for (const y of steep) cells.add(clampCell(y, rows) * totalCols + col);
      if (flat.length) cells.add(clampCell(mean(flat), rows) * totalCols + col);
    }

    // Row-major order, so runs of adjacent columns are consecutive keys.
    const sorted = [...cells].sort((a, b) => a - b);
    let start = null;
    let prev = null;
    const flush = () => {
      if (start === null) return;
      const row = Math.floor(start / totalCols);
      const col = start % totalCols;
      const len = prev - start + 1;
      const key = `${stroke.inst}:${row}:${col}`;
      if (!notes.has(key) || notes.get(key).len < len) {
        notes.set(key, { inst: stroke.inst, row, col, len });
      }
    };
    for (const key of sorted) {
      if (prev !== null && key === prev + 1 && key % totalCols !== 0) {
        prev = key;
        continue;
      }
      flush();
      start = prev = key;
    }
    flush();
  }

  return [...notes.values()];
}

// Free Thinker: flat parts of a stroke become glides, whose pitch follows the
// line through time; steep parts become clusters spanning their height.
// Columns are on the FREE_COLS grid; `y` values are 0..1 canvas heights.
export function freeVoices(strokes, aspect = 1) {
  const voices = [];
  const sampleStep = 0.25 / FREE_COLS;

  for (const { inst, points } of strokes) {
    let glide = [];
    let dir = 0;
    const endGlide = () => {
      if (glide.length) {
        if (dir < 0) glide.reverse();
        voices.push({ inst, kind: 'glide', col: glide[0].col, points: glide });
      }
      glide = [];
      dir = 0;
    };

    for (const { col, flat, steep } of strokeVisits(points, FREE_COLS, sampleStep, aspect)) {
      if (steep.length) {
        endGlide();
        voices.push({ inst, kind: 'cluster', col, top: Math.min(...steep), bottom: Math.max(...steep) });
        continue;
      }
      // A glide moves through time one column at a time, in one direction.
      const step = glide.length ? col - glide.at(-1).col : 0;
      if (glide.length && (Math.abs(step) !== 1 || (dir && step !== dir))) endGlide();
      else if (glide.length) dir = step;
      glide.push({ col, y: mean(flat) });
    }
    endGlide();
  }

  return voices;
}

// One recording every minor third from A0 to C8; notes between are repitched.
const SAMPLE_NOTES = ['A0', 'C8'];
for (let octave = 1; octave <= 7; octave++) {
  for (const note of ['C', 'D#', 'F#', 'A']) SAMPLE_NOTES.push(note + octave);
}
const SAMPLE_MIDIS = SAMPLE_NOTES.map(noteToMidi);

const salamanderFile = (note) => `${note.replace('#', 's')}.mp3`;
const gmFile = (note) => `${note.replace('D#', 'Eb').replace('F#', 'Gb')}.mp3`;

const MIN_GLIDE = 0.25; // seconds

// The audio engine. Instruments load on demand: `ready(ids)` resolves once
// all of them can play; notes for an instrument still loading are skipped.
export function createAudio() {
  const limiter = new Tone.Limiter(-3).toDestination();
  const reverb = new Tone.Reverb({ decay: 2.5, wet: 0.25 }).connect(limiter);

  const buffers = {};
  const samplers = {};
  const loading = {};

  function load(id) {
    loading[id] ??= new Promise((resolve, reject) => {
      const entry = LIBRARY[id];
      const file = entry.naming === 'salamander' ? salamanderFile : gmFile;
      const urls = Object.fromEntries(SAMPLE_NOTES.map((n) => [n, `samples/${entry.samples}/${file(n)}`]));
      buffers[id] = new Tone.ToneAudioBuffers({
        urls,
        onload: () => {
          const loaded = Object.fromEntries(SAMPLE_NOTES.map((n) => [n, buffers[id].get(n)]));
          samplers[id] = new Tone.Sampler({ urls: loaded, attack: entry.attack ?? 0, release: entry.release }).connect(reverb);
          resolve();
        },
        onerror: (err) => {
          delete loading[id]; // allow a retry
          reject(err);
        },
      });
    });
    return loading[id];
  }

  const ready = (ids) => Promise.all([reverb.ready, ...ids.map(load)]);

  const glides = new Set();

  // Plays one recording whose playback rate follows `curve`: a list of
  // { t, midi } with t in seconds after `time`.
  function playGlide(id, curve, time) {
    if (!samplers[id]) return;
    const bank = LIBRARY[id];
    const midis = curve.map((c) => c.midi);
    const center = (Math.min(...midis) + Math.max(...midis)) / 2;
    let nearest = 0;
    SAMPLE_MIDIS.forEach((m, i) => {
      if (Math.abs(m - center) < Math.abs(SAMPLE_MIDIS[nearest] - center)) nearest = i;
    });
    const rate = (midi) => 2 ** ((midi - SAMPLE_MIDIS[nearest]) / 12);

    const source = new Tone.ToneBufferSource({
      url: buffers[id].get(SAMPLE_NOTES[nearest]),
      fadeIn: bank.attack ?? 0.005,
      fadeOut: bank.release,
      loop: Boolean(bank.loop),
      loopStart: bank.loop?.[0] ?? 0,
      loopEnd: bank.loop?.[1] ?? 0,
    }).connect(reverb);
    source.playbackRate.setValueAtTime(rate(curve[0].midi), time);
    for (const c of curve.slice(1)) source.playbackRate.linearRampToValueAtTime(rate(c.midi), time + c.t);
    source.onended = () => {
      glides.delete(source);
      source.dispose();
    };
    glides.add(source);
    source.start(time);
    source.stop(time + Math.max(MIN_GLIDE, curve.at(-1).t));
  }

  function stopAll() {
    for (const sampler of Object.values(samplers)) sampler.releaseAll();
    for (const source of glides) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
  }

  return { samplers, ready, playGlide, stopAll };
}

// Steps through `cols` columns over `duration` seconds. `playStep(col, time,
// stepDur)` schedules the audio and reads the current drawing every step, so
// drawing while playing is heard immediately; `onStep(col)` runs in sync with
// the display.
export function startPlayback({ cols, duration, isLoop, playStep, onStep, onEnd }) {
  const transport = Tone.Transport;
  transport.stop();
  transport.cancel();
  transport.position = 0;

  const stepDur = duration / cols;
  let col = 0;
  let done = false;

  transport.scheduleRepeat((time) => {
    if (done) return;
    if (col >= cols) {
      if (!isLoop()) {
        done = true;
        Tone.Draw.schedule(onEnd, time);
        return;
      }
      col = 0;
    }
    playStep(col, time, stepDur);
    const current = col;
    Tone.Draw.schedule(() => onStep(current), time);
    col++;
  }, stepDur, 0);

  transport.start('+0.05');
}

export function stopPlayback(instruments) {
  Tone.Transport.stop();
  Tone.Transport.cancel();
  instruments?.stopAll();
}

export const playbackSeconds = () => Math.max(0, Tone.Transport.seconds);
