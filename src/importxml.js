// Reads MusicXML scores (.musicxml / .xml, or compressed .mxl) into parts of
// notes, with times in quarter notes and sounding MIDI pitches. Covers rests,
// chords, ties, voices (backup/forward) and transposing instruments; grace
// notes, cue notes, unpitched percussion and repeats are skipped.

const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function elements(node, name) {
  const out = [];
  for (let i = 0; i < node.childNodes.length; i++) {
    const n = node.childNodes.item(i);
    if (n.nodeType === 1 && (!name || n.nodeName === name)) out.push(n);
  }
  return out;
}

const child = (node, name) => (node ? elements(node, name)[0] : undefined);
const text = (node, name) => child(node, name)?.textContent.trim();
const num = (node, name, fallback = 0) => {
  const value = text(node, name);
  return value ? Number(value) : fallback;
};

export async function readScoreFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  const xml = isZip ? await mxlToXml(bytes) : new TextDecoder().decode(bytes);
  return parseMusicXML(new DOMParser().parseFromString(xml, 'application/xml'));
}

export function parseMusicXML(doc) {
  const root = doc.documentElement;
  if (root?.nodeName === 'score-timewise') throw new Error('Timewise MusicXML is not supported yet.');
  if (root?.nodeName !== 'score-partwise') throw new Error('This file is not a MusicXML score.');

  const title = text(child(root, 'work'), 'work-title') || text(root, 'movement-title') || 'Untitled score';
  const names = {};
  for (const scorePart of elements(child(root, 'part-list') ?? root, 'score-part')) {
    names[scorePart.getAttribute('id')] = text(scorePart, 'part-name') || scorePart.getAttribute('id');
  }

  let bpm = null;
  const readTempo = (sound) => {
    const tempo = Number(sound?.getAttribute('tempo'));
    if (bpm === null && tempo > 0) bpm = tempo;
  };

  const parts = elements(root, 'part').map((part) => {
    const notes = [];
    const tied = new Map(); // midi -> note waiting for its tie to continue
    let divisions = 1;
    let transpose = 0; // written to sounding pitch, in semitones
    let measureStart = 0;

    for (const measure of elements(part, 'measure')) {
      let cursor = measureStart;
      let lastStart = measureStart;
      let measureEnd = measureStart;

      for (const el of elements(measure)) {
        if (el.nodeName === 'attributes') {
          if (child(el, 'divisions')) divisions = num(el, 'divisions', 1);
          const t = child(el, 'transpose');
          if (t) transpose = num(t, 'chromatic') + 12 * num(t, 'octave-change');
        } else if (el.nodeName === 'backup') {
          cursor -= num(el, 'duration') / divisions;
        } else if (el.nodeName === 'forward') {
          cursor += num(el, 'duration') / divisions;
        } else if (el.nodeName === 'sound') {
          readTempo(el);
        } else if (el.nodeName === 'direction') {
          readTempo(child(el, 'sound'));
        } else if (el.nodeName === 'note' && !child(el, 'grace') && !child(el, 'cue')) {
          const dur = num(el, 'duration') / divisions;
          const inChord = Boolean(child(el, 'chord'));
          const start = inChord ? lastStart : cursor;
          if (!inChord) {
            lastStart = cursor;
            cursor += dur;
          }

          const pitch = child(el, 'pitch');
          if (pitch) {
            const midi = Math.round(STEP_SEMITONES[text(pitch, 'step')] + num(pitch, 'alter')
              + 12 * (num(pitch, 'octave') + 1) + transpose);
            const ties = elements(el, 'tie').map((t) => t.getAttribute('type'));
            const previous = tied.get(midi);
            if (ties.includes('stop') && previous && Math.abs(previous.start + previous.dur - start) < 1e-6) {
              previous.dur += dur;
              if (!ties.includes('start')) tied.delete(midi);
            } else {
              const note = { midi, start, dur };
              notes.push(note);
              if (ties.includes('start')) tied.set(midi, note);
            }
          }
        }
        measureEnd = Math.max(measureEnd, cursor);
      }
      measureStart = measureEnd;
    }

    return { name: names[part.getAttribute('id')] ?? part.getAttribute('id'), notes };
  });

  return { title, bpm: bpm ?? 100, parts };
}

// The longest note value (in quarter notes) that every onset and length is a
// multiple of, down to a 32nd note. Finer rhythms such as triplets get rounded.
export function chooseStep(notes) {
  const fits = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
  for (const step of [1, 0.5, 0.25, 0.125]) {
    if (notes.every((n) => fits(n.start, step) && fits(n.dur, step))) return step;
  }
  return 0.125;
}

/* ---- .mxl (zip) ---- */

async function mxlToXml(bytes) {
  const files = unzip(bytes);
  let path = null;
  const container = files.get('META-INF/container.xml');
  if (container) {
    const doc = new DOMParser().parseFromString(await inflate(container), 'application/xml');
    path = doc.getElementsByTagName('rootfile').item(0)?.getAttribute('full-path');
  }
  path ??= [...files.keys()].find((name) => !name.startsWith('META-INF/') && /\.(musicxml|xml)$/.test(name));
  if (!files.has(path)) throw new Error('No score was found inside the .mxl file.');
  return inflate(files.get(path));
}

// Minimal zip reader: lists the entries from the central directory.
function unzip(bytes) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && data.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('This .mxl file is damaged.');

  const files = new Map();
  let p = data.getUint32(end + 16, true);
  for (let i = data.getUint16(end + 10, true); i > 0; i--) {
    const nameLength = data.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLength));
    const offset = data.getUint32(p + 42, true);
    const start = offset + 30 + data.getUint16(offset + 26, true) + data.getUint16(offset + 28, true);
    files.set(name, {
      method: data.getUint16(p + 10, true),
      bytes: bytes.subarray(start, start + data.getUint32(p + 20, true)),
    });
    p += 46 + nameLength + data.getUint16(p + 30, true) + data.getUint16(p + 32, true);
  }
  return files;
}

async function inflate({ method, bytes }) {
  if (method === 0) return new TextDecoder().decode(bytes);
  if (method !== 8) throw new Error('This .mxl file uses an unsupported compression.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
