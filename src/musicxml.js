import { LIBRARY, PITCH_RANGE, rowToMidi } from './music.js';

// One grid step is written as a 16th note (divisions = 4 per quarter).
// Measures only exist so notation programs can lay out lines: barlines,
// key and time signatures are all hidden.
const STEPS_PER_MEASURE = 16;

const NOTE_VALUES = [
  [16, 'whole', false], [12, 'half', true], [8, 'half', false], [6, 'quarter', true],
  [4, 'quarter', false], [3, 'eighth', true], [2, 'eighth', false], [1, '16th', false],
];

const SPELLING = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
  ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];

// Split a length in steps into written note values, largest first.
function splitLength(len) {
  const pieces = [];
  while (len > 0) {
    const value = NOTE_VALUES.find(([steps]) => steps <= len);
    pieces.push(value);
    len -= value[0];
  }
  return pieces;
}

// Merge overlapping notes of the same pitch; touching ones stay separate.
function mergeOverlaps(notes) {
  const merged = [];
  for (const note of [...notes].sort((a, b) => a.midi - b.midi || a.start - b.start)) {
    const last = merged.at(-1);
    if (last && last.midi === note.midi && note.start < last.end) last.end = Math.max(last.end, note.end);
    else merged.push({ ...note });
  }
  return merged;
}

// Cut the part at every note start/end and barline; each slice becomes one
// chord (or rest), tied to its neighbours where notes keep sounding.
function sliceIntoMeasures(notes, cols, measureCount) {
  const bounds = new Set([0, cols]);
  for (let m = 1; m < measureCount; m++) bounds.add(m * STEPS_PER_MEASURE);
  for (const n of notes) bounds.add(n.start).add(n.end);
  const sorted = [...bounds].sort((a, b) => a - b);

  const measures = Array.from({ length: measureCount }, () => []);
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const chord = notes
      .filter((n) => n.start <= a && n.end > a)
      .map((n) => ({ midi: n.midi, tieStop: n.start < a, tieStart: n.end > b }));
    measures[Math.floor(a / STEPS_PER_MEASURE)].push({ len: b - a, chord });
  }
  return measures;
}

function noteXML({ midi, inChord, tieStop, tieStart, value, accidental }) {
  const [steps, type, dotted] = value;
  const [step, alter] = SPELLING[midi % 12];
  const ties = (tieStop ? '<tie type="stop"/>' : '') + (tieStart ? '<tie type="start"/>' : '');
  const tied = (tieStop ? '<tied type="stop"/>' : '') + (tieStart ? '<tied type="start"/>' : '');
  return '<note>'
    + (inChord ? '<chord/>' : '')
    + `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`
    + `<duration>${steps}</duration>${ties}<voice>1</voice><type>${type}</type>${dotted ? '<dot/>' : ''}`
    + (accidental ? `<accidental>${accidental}</accidental>` : '')
    + (tied ? `<notations>${tied}</notations>` : '')
    + '</note>';
}

function restXML([steps, type, dotted]) {
  return `<note><rest/><duration>${steps}</duration><voice>1</voice><type>${type}</type>${dotted ? '<dot/>' : ''}</note>`;
}

const hiddenTime = (len) => (len === STEPS_PER_MEASURE
  ? '<time print-object="no"><beats>4</beats><beat-type>4</beat-type></time>'
  : `<time print-object="no"><beats>${len}</beats><beat-type>16</beat-type></time>`);

function partXML(part, cols, measureCount, bpm, withTempo) {
  const midis = part.notes.map((n) => n.midi).sort((a, b) => a - b);
  const clef = midis[Math.floor(midis.length / 2)] >= 60
    ? '<clef><sign>G</sign><line>2</line></clef>'
    : '<clef><sign>F</sign><line>4</line></clef>';
  const measureLen = (i) => Math.min(STEPS_PER_MEASURE, cols - i * STEPS_PER_MEASURE);

  return sliceIntoMeasures(part.notes, cols, measureCount).map((slices, i) => {
    let xml = `<measure number="${i + 1}">`;
    if (i === 0) {
      xml += '<print><measure-numbering>none</measure-numbering></print>'
        + '<attributes><divisions>4</divisions>'
        + '<key print-object="no"><fifths>0</fifths><mode>none</mode></key>'
        + `${hiddenTime(measureLen(0))}${clef}</attributes>`;
      if (withTempo) {
        xml += '<direction placement="above"><direction-type><metronome>'
          + `<beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute>`
          + `</metronome></direction-type><sound tempo="${bpm}"/></direction>`;
      }
    } else if (measureLen(i) !== measureLen(i - 1)) {
      xml += `<attributes>${hiddenTime(measureLen(i))}</attributes>`;
    }

    const alterations = new Map(); // "C4" -> alter last written in this measure
    for (const { len, chord } of slices) {
      const pieces = splitLength(len);
      pieces.forEach((value, k) => {
        if (!chord.length) {
          xml += restXML(value);
          return;
        }
        chord.forEach((note, j) => {
          const [step, alter] = SPELLING[note.midi % 12];
          const key = step + Math.floor(note.midi / 12);
          const tieStop = k > 0 || note.tieStop;
          let accidental = null;
          if (!tieStop && (alterations.get(key) ?? 0) !== alter) accidental = alter ? 'sharp' : 'natural';
          alterations.set(key, alter);
          xml += noteXML({
            midi: note.midi,
            inChord: j > 0,
            tieStop,
            tieStart: k < pieces.length - 1 || note.tieStart,
            value,
            accidental,
          });
        });
      });
    }

    const last = i === measureCount - 1;
    xml += `<barline location="right"><bar-style>${last ? 'light-heavy' : 'none'}</bar-style></barline>`;
    return `${xml}</measure>`;
  }).join('\n');
}

// `instruments` is the session's list of LIBRARY ids, in part order.
export function toMusicXML({ notes, cols, duration, instruments, title = 'Pantonal' }) {
  const range = PITCH_RANGE;
  const bpm = Math.round(60 / ((duration / cols) * 4));
  const measureCount = Math.ceil(cols / STEPS_PER_MEASURE);

  const parts = instruments
    .map((id) => ({
      inst: LIBRARY[id],
      notes: mergeOverlaps(notes
        .filter((n) => n.inst === id)
        .map((n) => ({ midi: rowToMidi(n.row, range), start: n.col, end: n.col + n.len }))),
    }))
    .filter((part) => part.notes.length);

  const partList = parts.map(({ inst }, i) => `<score-part id="P${i + 1}">`
    + `<part-name>${inst.label}</part-name>`
    + `<score-instrument id="P${i + 1}-I1"><instrument-name>${inst.label}</instrument-name></score-instrument>`
    + `<midi-instrument id="P${i + 1}-I1"><midi-channel>${i + 1}</midi-channel><midi-program>${inst.program}</midi-program></midi-instrument>`
    + '</score-part>').join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n'
    + '<score-partwise version="4.0">\n'
    + `<work><work-title>${title}</work-title></work>\n`
    + '<identification><encoding><software>Pantonal</software></encoding></identification>\n'
    + `<part-list>\n${partList}\n</part-list>\n`
    + parts.map((part, i) => `<part id="P${i + 1}">\n${partXML(part, cols, measureCount, bpm, i === 0)}\n</part>`).join('\n')
    + '\n</score-partwise>\n';
}
