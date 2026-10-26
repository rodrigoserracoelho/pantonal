/* global Tone */
import {
  LIBRARY, DEFAULT_INSTRUMENTS, MAX_INSTRUMENTS, COLORS, FREE_COLS, PITCH_RANGE, rowToMidi, midiToRow,
  isBlackKey, noteToMidi, mtof, freeMidi, quantize, freeVoices, createAudio, startPlayback, stopPlayback,
  playbackSeconds,
} from './music.js';
import { SCORES, parseScore } from './scores.js';
import { toMusicXML } from './musicxml.js';
import { readScoreFile, chooseStep } from './importxml.js';
import { ICONS, applyIcons } from './icons.js';
import { createAir, setBand as setAirBand, SCALES, AIR_LOW, AIR_HIGH, yOfHeight } from './air.js';
import { LANGUAGES, t, language, setLanguage, onLanguageChange, translatePage, keyName, noteName } from './i18n.js';
import { createEcho } from './echo.js';

applyIcons();
translatePage();

const instrumentName = (id) => t(`instrument.${id}`);

const BRUSH_WIDTH = 10;
const ERASE_RADIUS = 20;
const POINT_SPACING = 4; // max px between stored stroke points
const INACTIVE_ALPHA = 0.3; // how other instruments' layers are drawn

const CLUSTER_SECONDS = 0.6; // how long a Free Thinker cluster rings

const defaultColors = () => Object.fromEntries(DEFAULT_INSTRUMENTS.map((id, i) => [id, COLORS[i]]));

const state = {
  mode: null, // 'free' | 'chromatic', chosen in the mode dialog
  tool: 'brush',
  instruments: [...DEFAULT_INSTRUMENTS], // LIBRARY ids of this session, in rail order
  colors: defaultColors(), // instrument id -> layer colour
  inst: 'piano', // the selected instrument
  // { inst, points: [{ x, y }] }: x in screen widths from the start of the
  // piece, y from 0 (top) to 1 (bottom) of the whole pitch range.
  strokes: [],
  cols: 64, // steps per screen
  octaves: 3, // octaves per screen (zoom)
  duration: 12, // seconds per screen
  grid: true,
  loop: false,
  vibratoDepth: 25, // Air Thinker vibrato, in cents
  vibratoRate: 5.5, // vibrations per second
  airScale: 'free', // Air Thinker: a SCALES id
  airKey: 0, // Air Thinker: the key, 0 = C
  showTheremin: true, // Air Thinker: draw the theremin in the camera view
  playing: false,
  playCol: -1,
  playDuration: 0, // seconds of the piece being played
};

// Top-left corner of the visible part of the canvas, in stroke coordinates.
// Only Chromatic Thinker scrolls; Free Thinker is a single screen.
const view = { x: 0, y: 0 };

let audio = null; // created on the first Play
const air = createAir(); // Air Thinker's camera theremin
const echo = createEcho(air); // Air Thinker's Echo game
let airError = null; // translation key of why the camera couldn't start, shown on the stage
let notes = []; // Chromatic Thinker: quantized notes
let byCol = []; // notes, or Free Thinker voices, by starting column
let totalCols = 0; // length of the piece in columns
let notesDirty = true;
let boundsCache = new WeakMap(); // stroke -> bounds, reset whenever strokes change
let sessionChanged = false; // strokes or grid settings changed since the last save

const isChromatic = () => state.mode !== 'free';
const colorOf = (id) => state.colors[id] ?? '#888888';

// Height of the whole pitch range in px: `octaves` octaves fill one screen.
const worldHeight = () => (isChromatic() ? (PITCH_RANGE.rows * H) / (12 * state.octaves) : H);

// Scrolls vertically so `midi` is in the middle of the screen.
function centerViewOn(midi) {
  view.y = (midiToRow(midi, PITCH_RANGE) + 0.5) / PITCH_RANGE.rows - (6 * state.octaves) / PITCH_RANGE.rows;
}

function refreshNotes() {
  if (!notesDirty) return;
  boundsCache = new WeakMap();
  sessionChanged = true;
  const aspect = W / worldHeight() || 1;
  if (isChromatic()) {
    // At least one screen, then up to the last line.
    let end = 0;
    for (const stroke of state.strokes) for (const p of stroke.points) end = Math.max(end, p.x);
    totalCols = Math.max(state.cols, Math.floor(end * state.cols) + 1);
    notes = quantize(state.strokes, state.cols, PITCH_RANGE.rows, aspect, totalCols);
    byCol = Array.from({ length: totalCols }, () => []);
    for (const note of notes) byCol[note.col].push(note);
  } else {
    totalCols = FREE_COLS;
    notes = [];
    byCol = Array.from({ length: FREE_COLS }, () => []);
    for (const voice of freeVoices(state.strokes, aspect)) byCol[voice.col].push(voice);
  }
  notesDirty = false;
}

// The canvas extends one empty screen past the end of the piece.
function clampView() {
  if (!isChromatic()) {
    view.x = view.y = 0;
    return;
  }
  view.x = Math.min(Math.max(0, view.x), totalCols / state.cols);
  view.y = Math.min(Math.max(0, view.y), 1 - H / worldHeight());
}

/* ---- Canvas ---- */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;

new ResizeObserver(() => {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  notesDirty = true; // steepness depends on the aspect ratio
}).observe(canvas);

// Position of the playhead in screen widths, following loops.
function playheadX() {
  const seconds = state.loop ? playbackSeconds() % state.playDuration : Math.min(playbackSeconds(), state.playDuration);
  return seconds / state.duration;
}

function render() {
  if (state.mode === 'air') {
    renderAir();
    requestAnimationFrame(render);
    return;
  }
  refreshNotes();
  const chromatic = isChromatic();
  const range = PITCH_RANGE;
  const WH = worldHeight();
  const cw = W / state.cols;
  const rh = WH / range.rows;

  // Follow the playhead when it leaves the screen, unless the user is panning.
  if (state.playing && chromatic && !panGesture) {
    const x = playheadX();
    if (x < view.x || x > view.x + 1) view.x = Math.max(0, x - 0.05);
  }
  clampView();

  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, W, H);

  // Everything below is drawn in world px: x * W, y * WH.
  ctx.save();
  ctx.translate(-view.x * W, -view.y * WH);
  const left = view.x * W;
  const worldW = (totalCols / state.cols + 1) * W;

  if (chromatic && state.grid) {
    for (let row = 0; row < range.rows; row++) {
      if (isBlackKey(rowToMidi(row, range))) {
        ctx.fillStyle = '#f1efe9';
        ctx.fillRect(left, row * rh, W, rh);
      }
    }
    ctx.lineWidth = 1;
    const firstCol = Math.ceil(view.x * state.cols / 4) * 4;
    for (let col = Math.max(4, firstCol); col * cw < left + W; col += 4) {
      ctx.strokeStyle = col % 16 === 0 ? '#ddd9cf' : '#ebe8e0';
      ctx.beginPath();
      ctx.moveTo(col * cw, 0);
      ctx.lineTo(col * cw, WH);
      ctx.stroke();
    }
    ctx.font = '10px system-ui, sans-serif';
    for (let row = 0; row < range.rows; row++) {
      const midi = rowToMidi(row, range);
      if (midi % 12 !== 0) continue;
      ctx.strokeStyle = '#d6d1c4';
      ctx.beginPath();
      ctx.moveTo(left, (row + 1) * rh);
      ctx.lineTo(left + W, (row + 1) * rh);
      ctx.stroke();
      ctx.fillStyle = '#a49e90';
      ctx.fillText(noteName(midi), left + 4, (row + 1) * rh - 3);
    }
  }

  // Only what's on screen is drawn, so long imported scores stay smooth.
  const visible = {
    minX: view.x - 0.02,
    maxX: view.x + 1.02,
    minY: view.y - 0.02,
    maxY: view.y + H / WH + 0.02,
  };
  const onScreen = (b) => b.maxX >= visible.minX && b.minX <= visible.maxX && b.maxY >= visible.minY && b.minY <= visible.maxY;

  // Quantized notes: faint when the grid is on, bright when sounding.
  for (const note of notes) {
    if (!onScreen({
      minX: note.col / state.cols,
      maxX: (note.col + note.len) / state.cols,
      minY: note.row / range.rows,
      maxY: (note.row + 1) / range.rows,
    })) continue;
    const sounding = state.playCol >= note.col && state.playCol < note.col + note.len;
    if (!sounding && !state.grid) continue;
    const active = note.inst === state.inst;
    ctx.globalAlpha = sounding ? 0.9 : active ? 0.25 : 0.1;
    ctx.fillStyle = colorOf(note.inst);
    ctx.fillRect(note.col * cw + 0.5, note.row * rh + 0.5, note.len * cw - 1, Math.max(1, rh - 1));
  }

  // Inactive layers first so the selected instrument is always on top.
  ctx.lineWidth = BRUSH_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ordered = [
    ...state.strokes.filter((s) => s.inst !== state.inst),
    ...state.strokes.filter((s) => s.inst === state.inst),
  ];
  for (const stroke of ordered) {
    if (!boundsCache.has(stroke)) boundsCache.set(stroke, boundsOf([stroke]));
    if (!onScreen(boundsCache.get(stroke))) continue;
    ctx.globalAlpha = !chromatic || stroke.inst === state.inst ? 0.95 : INACTIVE_ALPHA;
    ctx.strokeStyle = colorOf(stroke.inst);
    ctx.beginPath();
    stroke.points.forEach((p, i) => (i ? ctx.lineTo(p.x * W, p.y * WH) : ctx.moveTo(p.x * W, p.y * WH)));
    if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x * W + 0.1, stroke.points[0].y * WH);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (state.tool === 'select') {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#333';
    if (selection.size) {
      const b = boundsOf(selection);
      const pad = BRUSH_WIDTH;
      ctx.strokeRect(b.minX * W - pad, b.minY * WH - pad, (b.maxX - b.minX) * W + pad * 2, (b.maxY - b.minY) * WH + pad * 2);
    }
    if (selectGesture?.mode === 'rect') {
      const { start: a, end: b } = selectGesture;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      ctx.fillRect(a.x * W, a.y * WH, (b.x - a.x) * W, (b.y - a.y) * WH);
      ctx.strokeRect(a.x * W, a.y * WH, (b.x - a.x) * W, (b.y - a.y) * WH);
    }
    ctx.restore();
  }

  if (state.playing) {
    const x = playheadX() * W;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WH);
    ctx.stroke();
  }
  ctx.restore();

  // Position bars along the bottom and right edges, when there is more to see.
  if (chromatic) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    if (worldW > W) ctx.fillRect((left / worldW) * W, H - 5, (W / worldW) * W, 3);
    if (WH > H) ctx.fillRect(W - 5, view.y * H, 3, (H / WH) * H);
  }

  requestAnimationFrame(render);
}

/* ---- Undo / redo ---- */

// Snapshots of the strokes and the session's instruments; settings like
// octaves or steps are not undoable.
const MAX_HISTORY = 100;
const undoStack = [];
const redoStack = [];
let gestureBefore = null; // snapshot taken when a canvas gesture starts

const snapshot = () => JSON.stringify({ instruments: state.instruments, colors: state.colors, strokes: state.strokes });

function record(before = snapshot()) {
  undoStack.push(before);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  syncHistoryButtons();
}

function restore(from, to) {
  if (!from.length || drawing.size || selectGesture) return;
  to.push(snapshot());
  const { instruments, colors, strokes } = JSON.parse(from.pop());
  state.strokes = strokes;
  if (instruments.join() !== state.instruments.join()) setInstruments(instruments, colors);
  setSelection([]);
  lastPaste = null;
  notesDirty = true;
  syncHistoryButtons();
}

const undo = () => restore(undoStack, redoStack);
const redo = () => restore(redoStack, undoStack);

function syncHistoryButtons() {
  document.querySelector('[data-action="undo"]').disabled = !undoStack.length;
  document.querySelector('[data-action="redo"]').disabled = !redoStack.length;
}

document.querySelector('[data-action="undo"]').addEventListener('click', undo);
document.querySelector('[data-action="redo"]').addEventListener('click', redo);

/* ---- Drawing ---- */

const drawing = new Map(); // pointerId -> stroke being drawn (null while erasing)

let panGesture = null; // { pointerId, x, y, view } while dragging with the pan tool

// Pointer position in stroke coordinates, kept within the visible screen.
const toWorld = (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const sy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  return { x: view.x + sx, y: Math.min(1, view.y + (sy * H) / worldHeight()) };
};

function addPoint(stroke, p) {
  const last = stroke.points.at(-1);
  const n = Math.floor(Math.hypot((p.x - last.x) * W, (p.y - last.y) * worldHeight()) / POINT_SPACING);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    stroke.points.push({ x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t });
  }
  stroke.points.push(p);
}

// Removes points near `p` from editable strokes, splitting them. In Chromatic
// Thinker only the selected instrument's layer is editable.
function eraseAt(p) {
  const WH = worldHeight();
  const kept = [];
  for (const stroke of state.strokes) {
    if (state.mode !== 'free' && stroke.inst !== state.inst) {
      kept.push(stroke);
      continue;
    }
    let segment = [];
    for (const q of stroke.points) {
      if (Math.hypot((q.x - p.x) * W, (q.y - p.y) * WH) < ERASE_RADIUS) {
        if (segment.length) kept.push({ inst: stroke.inst, points: segment });
        segment = [];
      } else {
        segment.push(q);
      }
    }
    if (segment.length) kept.push({ inst: stroke.inst, points: segment });
  }
  state.strokes = kept;
  notesDirty = true;
}

/* ---- Selection ---- */

let selection = new Set(); // strokes of the selected instrument
let clipboard = null; // deep copies of the copied strokes
let selectGesture = null; // { pointerId, mode: 'rect' | 'move', ... }

const selectBar = document.getElementById('select-bar');
const cellOf = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
const clampInt = (v, min, max) => Math.min(max, Math.max(min, v));

function boundsOf(strokes) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      b.minX = Math.min(b.minX, p.x);
      b.minY = Math.min(b.minY, p.y);
      b.maxX = Math.max(b.maxX, p.x);
      b.maxY = Math.max(b.maxY, p.y);
    }
  }
  return b;
}

function setSelection(strokes) {
  selection = new Set(strokes);
  syncSelectBar();
}

function syncSelectBar() {
  selectBar.hidden = state.tool !== 'select';
  selectBar.querySelector('[data-select="copy"]').disabled = !selection.size;
  selectBar.querySelector('[data-select="delete"]').disabled = !selection.size;
  selectBar.querySelector('[data-select="paste"]').disabled = !clipboard;
}

function startSelectGesture(e, p) {
  const rows = PITCH_RANGE.rows;
  if (selection.size) {
    const b = boundsOf(selection);
    const padX = BRUSH_WIDTH / W;
    const padY = BRUSH_WIDTH / worldHeight();
    if (p.x >= b.minX - padX && p.x <= b.maxX + padX && p.y >= b.minY - padY && p.y <= b.maxY + padY) {
      // Moves snap to whole cells so the figure keeps its rhythm and intervals.
      // There is no right edge: the piece grows.
      selectGesture = {
        pointerId: e.pointerId,
        mode: 'move',
        start: p,
        applied: { dc: 0, dr: 0 },
        dcMin: Math.ceil(-b.minX * state.cols),
        dcMax: Infinity,
        drMin: Math.ceil(-b.minY * rows),
        drMax: Math.floor((1 - b.maxY) * rows),
      };
      return;
    }
  }
  selectGesture = { pointerId: e.pointerId, mode: 'rect', start: p, end: p };
}

function moveSelection(g, p) {
  const rows = PITCH_RANGE.rows;
  const dc = clampInt(Math.round((p.x - g.start.x) * state.cols), g.dcMin, g.dcMax);
  const dr = clampInt(Math.round((p.y - g.start.y) * rows), g.drMin, g.drMax);
  const dx = (dc - g.applied.dc) / state.cols;
  const dy = (dr - g.applied.dr) / rows;
  if (!dx && !dy) return;
  for (const stroke of selection) {
    for (const q of stroke.points) {
      q.x += dx;
      q.y += dy;
    }
  }
  g.applied = { dc, dr };
  notesDirty = true;
}

function finishSelectRect({ start: a, end: b }) {
  const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  setSelection(state.strokes.filter((s) => s.inst === state.inst
    && s.points.some((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)));
}

// The last paste: the pasted strokes, the top-left cell of the group it was
// pasted after, and the top-left cell where it was placed.
let lastPaste = null;

function topLeftCell(strokes) {
  const b = boundsOf(strokes);
  return { col: Math.floor(b.minX * state.cols), row: cellOf(b.minY, PITCH_RANGE.rows) };
}

function copySelection() {
  if (!selection.size) return;
  clipboard = [...selection].map((s) => ({ points: s.points.map((q) => ({ ...q })) }));
  lastPaste = null;
  syncSelectBar();
}

// Pastes into the selected instrument. The first paste goes right after the
// current selection (or the copied figure); if the pasted copy is still
// selected, the next paste repeats the step from the previous group to it,
// including any drag in between. Repeated pastes build up an ostinato.
function paste() {
  if (!clipboard) return;
  const rows = PITCH_RANGE.rows;
  const anchorStrokes = selection.size ? [...selection] : clipboard;
  const from = topLeftCell(anchorStrokes);
  const repeating = lastPaste
    && selection.size === lastPaste.group.size
    && [...selection].every((s) => lastPaste.group.has(s));

  let target;
  if (repeating) {
    target = { col: from.col * 2 - lastPaste.from.col, row: from.row * 2 - lastPaste.from.row };
  } else {
    const anchor = boundsOf(anchorStrokes);
    target = { col: Math.floor(anchor.maxX * state.cols) + 1, row: from.row };
  }
  const clip = topLeftCell(clipboard);
  const dc = target.col - clip.col;
  const dr = target.row - clip.row;
  const pasted = clipboard
    .map((s) => ({
      inst: state.inst,
      points: s.points
        .map((q) => ({ x: q.x + dc / state.cols, y: q.y + dr / rows }))
        .filter((q) => q.y >= 0 && q.y <= 1),
    }))
    .filter((s) => s.points.length);
  if (!pasted.length) return;
  record();
  lastPaste = { group: new Set(pasted), from };
  state.strokes.push(...pasted);
  state.tool = 'select';
  syncToolbar();
  setSelection(pasted);
  notesDirty = true;
}

function deleteSelection() {
  if (!selection.size) return;
  record();
  state.strokes = state.strokes.filter((s) => !selection.has(s));
  setSelection([]);
  notesDirty = true;
}

for (const button of selectBar.querySelectorAll('[data-select]')) {
  const actions = { copy: copySelection, paste, delete: deleteSelection };
  button.addEventListener('click', actions[button.dataset.select]);
}

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') (e.shiftKey ? redo : undo)();
  else if (mod && key === 'y') redo();
  else if (mod && e.key === 'c') copySelection();
  else if (mod && e.key === 'v') paste();
  else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
  else if (e.key === 'Escape') setSelection([]);
  else return;
  e.preventDefault();
});

canvas.addEventListener('pointerdown', (e) => {
  if (state.mode === 'air') return;
  canvas.setPointerCapture(e.pointerId);
  closeScoreMenu();
  if (state.tool === 'pan') {
    panGesture ??= { pointerId: e.pointerId, x: e.clientX, y: e.clientY, view: { ...view } };
    return;
  }
  gestureBefore ??= snapshot();
  const p = toWorld(e);
  if (state.tool === 'select') {
    if (!selectGesture) startSelectGesture(e, p);
    return;
  }
  if (state.tool === 'brush') {
    const stroke = { inst: state.inst, points: [p] };
    state.strokes.push(stroke);
    drawing.set(e.pointerId, stroke);
  } else {
    drawing.set(e.pointerId, null);
    eraseAt(p);
  }
  notesDirty = true;
});

canvas.addEventListener('pointermove', (e) => {
  if (panGesture?.pointerId === e.pointerId) {
    view.x = panGesture.view.x - (e.clientX - panGesture.x) / W;
    view.y = panGesture.view.y - (e.clientY - panGesture.y) / worldHeight();
    clampView();
    return;
  }
  if (selectGesture?.pointerId === e.pointerId) {
    if (selectGesture.mode === 'move') moveSelection(selectGesture, toWorld(e));
    else selectGesture.end = toWorld(e);
    return;
  }
  if (!drawing.has(e.pointerId)) return;
  const stroke = drawing.get(e.pointerId);
  for (const ev of e.getCoalescedEvents?.() ?? [e]) {
    if (stroke) addPoint(stroke, toWorld(ev));
    else eraseAt(toWorld(ev));
  }
  notesDirty = true;
});

for (const type of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(type, (e) => {
    if (panGesture?.pointerId === e.pointerId) panGesture = null;
    drawing.delete(e.pointerId);
    if (selectGesture?.pointerId === e.pointerId) {
      if (selectGesture.mode === 'rect') finishSelectRect(selectGesture);
      selectGesture = null;
    }
    // One undo step per gesture, once every finger has lifted.
    if (drawing.size || selectGesture || gestureBefore === null) return;
    if (snapshot() !== gestureBefore) record(gestureBefore);
    gestureBefore = null;
  });
}

/* ---- Toolbar ---- */

// One rail button per instrument of the session, in its layer colour.
function buildInstrumentRail() {
  const instBox = document.getElementById('instruments');
  instBox.replaceChildren();
  for (const id of state.instruments) {
    const inst = LIBRARY[id];
    const button = document.createElement('button');
    button.dataset.inst = id;
    button.style.setProperty('--accent', colorOf(id));
    button.innerHTML = `<span class="clear-layer">⊗</span><span class="icon" style="color: ${colorOf(id)}">${ICONS[inst.icon]}</span><span class="name"></span>`;
    button.querySelector('.clear-layer').title = t('layer.clear', { name: instrumentName(id) });
    button.querySelector('.name').textContent = instrumentName(id);
    button.addEventListener('click', (e) => {
      if (e.target.closest('.clear-layer')) {
        record();
        state.strokes = state.strokes.filter((s) => s.inst !== id);
        notesDirty = true;
      }
      state.inst = id;
      setSelection([]);
      syncToolbar();
    });
    instBox.append(button);
  }
  syncToolbar();
}

/* ---- Instruments of the session ---- */

const instrumentsDialog = document.getElementById('instruments-dialog');

function setInstruments(ids, colors) {
  state.instruments = ids;
  state.colors = colors;
  if (!ids.includes(state.inst)) state.inst = ids[0];
  buildInstrumentRail();
  audio?.ready(ids).catch(() => {}); // start loading new sounds right away
  notesDirty = true;
}

function addInstrument(id) {
  if (state.instruments.length >= MAX_INSTRUMENTS || state.instruments.includes(id)) return;
  record();
  const used = new Set(Object.values(state.colors));
  const color = COLORS.find((c) => !used.has(c)) ?? COLORS[0];
  setInstruments([...state.instruments, id], { ...state.colors, [id]: color });
  state.inst = id;
  syncToolbar();
}

// Removing an instrument also removes its lines; Undo brings both back.
function removeInstrument(id) {
  if (state.instruments.length <= 1) return;
  record();
  state.strokes = state.strokes.filter((s) => s.inst !== id);
  const { [id]: _, ...colors } = state.colors;
  setInstruments(state.instruments.filter((i) => i !== id), colors);
  setSelection([]);
}

function renderInstrumentsDialog() {
  const full = state.instruments.length >= MAX_INSTRUMENTS;
  document.getElementById('instruments-note').textContent = t(full ? 'inst.full' : 'inst.note', { n: MAX_INSTRUMENTS });

  const current = document.getElementById('session-instruments');
  current.replaceChildren(...state.instruments.map((id) => {
    const card = document.createElement('div');
    card.className = 'instrument-card';
    card.innerHTML = `<span class="icon" style="color: ${colorOf(id)}">${ICONS[LIBRARY[id].icon]}</span>`
      + '<span class="name"></span><button class="remove">✕</button>';
    card.querySelector('.name').textContent = instrumentName(id);
    card.querySelector('.remove').setAttribute('aria-label', t('inst.remove', { name: instrumentName(id) }));
    const remove = card.querySelector('button');
    remove.disabled = state.instruments.length <= 1;
    remove.addEventListener('click', () => {
      removeInstrument(id);
      renderInstrumentsDialog();
    });
    return card;
  }));

  const families = {};
  for (const [id, inst] of Object.entries(LIBRARY)) {
    if (!state.instruments.includes(id)) (families[inst.family] ??= []).push(id);
  }
  const library = document.getElementById('library-instruments');
  library.replaceChildren(...Object.entries(families).flatMap(([family, ids]) => {
    const heading = document.createElement('h4');
    heading.textContent = t(`family.${family}`);
    const grid = document.createElement('div');
    grid.className = 'instrument-grid';
    for (const id of ids) {
      const button = document.createElement('button');
      button.className = 'instrument-card';
      button.disabled = full;
      button.innerHTML = `<span class="icon">${ICONS[LIBRARY[id].icon]}</span><span class="name"></span>`;
      button.querySelector('.name').textContent = instrumentName(id);
      button.addEventListener('click', () => {
        addInstrument(id);
        renderInstrumentsDialog();
      });
      grid.append(button);
    }
    return [heading, grid];
  }));
}

document.querySelector('[data-action="instruments"]').addEventListener('click', () => {
  renderInstrumentsDialog();
  instrumentsDialog.showModal();
});
document.getElementById('instruments-close').addEventListener('click', () => instrumentsDialog.close());

function syncToolbar() {
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === state.tool);
  for (const b of document.querySelectorAll('[data-inst]')) b.classList.toggle('active', b.dataset.inst === state.inst);
  if (state.tool !== 'select') selection.clear();
  canvas.style.cursor = state.mode === 'air' ? 'default' : state.tool === 'pan' ? 'grab' : 'crosshair';
  syncSelectBar();
}

for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => {
    state.tool = button.dataset.tool;
    syncToolbar();
  });
}

document.querySelector('[data-action="clear"]').addEventListener('click', () => {
  if (!state.strokes.length) return;
  record();
  state.strokes = [];
  setSelection([]);
  notesDirty = true;
});

/* ---- Score ---- */

const scoreMenu = document.getElementById('score-menu');
const closeScoreMenu = () => (scoreMenu.hidden = true);

function buildScoreMenu() {
  scoreMenu.replaceChildren(...SCORES.map((score) => {
    const button = document.createElement('button');
    button.innerHTML = '<span></span><small></small>';
    button.querySelector('span').textContent = t(score.title);
    button.querySelector('small').textContent = t(score.composer);
    button.addEventListener('click', () => {
      loadScore(score);
      closeScoreMenu();
    });
    return button;
  }));
  const importButton = document.createElement('button');
  importButton.innerHTML = '<span></span><small></small>';
  importButton.querySelector('span').textContent = t('import.menu');
  importButton.querySelector('small').textContent = t('import.formats');
  importButton.addEventListener('click', () => {
    closeScoreMenu();
    importFile.click();
  });
  scoreMenu.append(importButton);
}

document.querySelector('[data-action="score"]').addEventListener('click', () => {
  scoreMenu.hidden = !scoreMenu.hidden;
});

// A horizontal stroke for one note, `step` and `len` in steps of the current
// grid. Points every half step let the eraser split it.
function noteStroke(inst, midi, step, len) {
  const y = (midiToRow(midi, PITCH_RANGE) + 0.5) / PITCH_RANGE.rows;
  const x0 = (step + 0.2) / state.cols;
  const x1 = (step + len - 0.2) / state.cols;
  const points = [];
  for (let x = x0; x < x1; x += 0.5 / state.cols) points.push({ x, y });
  points.push({ x: x1, y });
  return { inst, points };
}

// Replaces the selected instrument's layer with the score, one stroke per note,
// and sets steps/duration so one step is the score's smallest note value.
function loadScore(score) {
  const { notes: scoreNotes, totalSteps } = parseScore(score);
  const pad = 2;
  const cols = Math.min(256, Math.ceil((totalSteps + pad * 2) / 4) * 4);
  controls.cols.set(cols);
  controls.duration.set(Math.round((cols * 60) / (score.bpm * score.stepsPerBeat)));

  // Notes go at their real pitch; the view centres on the melody.
  const midis = scoreNotes.map((n) => noteToMidi(n.name));
  centerViewOn((Math.min(...midis) + Math.max(...midis)) / 2);
  const strokes = scoreNotes.map((note, i) => noteStroke(state.inst, midis[i], pad + note.step, note.len));

  record();
  state.strokes = [...state.strokes.filter((s) => s.inst !== state.inst), ...strokes];
  setSelection([]);
  view.x = 0;
  notesDirty = true;
}

/* ---- Import MusicXML ---- */

const importDialog = document.getElementById('import-dialog');
const importFile = document.getElementById('import-file');
const QUARTERS_PER_SCREEN = 16;

buildScoreMenu();

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  try {
    openImportDialog(await readScoreFile(file));
  } catch (err) {
    openImportDialog(null, t(err.message));
  }
});

// Lists the parts with notes, each with an instrument (or "skip") to go to.
// The first three get Piano, Chorus and Flute.
function openImportDialog(score, error) {
  const list = document.getElementById('import-parts');
  list.replaceChildren();
  document.getElementById('import-title').textContent = score ? score.title || t('import.untitled') : t('import.failed');
  document.getElementById('import-error').textContent = error ?? '';
  document.getElementById('import-confirm').hidden = !score;
  importDialog.score = score;

  const defaults = [...state.instruments];
  score?.parts.forEach((part, index) => {
    if (!part.notes.length) return;
    const row = document.createElement('label');
    row.className = 'import-part';
    row.innerHTML = `<span></span><select data-part="${index}"></select>`;
    const select = row.querySelector('select');
    for (const [value, label] of [...state.instruments.map((id) => [id, instrumentName(id)]), ['', t('import.skip')]]) {
      select.append(new Option(label, value));
    }
    row.querySelector('span').textContent = t('import.part', { name: part.name, n: part.notes.length });
    row.querySelector('select').value = defaults.shift() ?? '';
    list.append(row);
  });
  importDialog.showModal();
}

// Replaces the drawing with the chosen parts. One step is the longest note
// value that fits the rhythm, and a screen holds 16 quarter notes.
function importScore(score, assignments) {
  const chosen = assignments.flatMap(({ part, inst }) => score.parts[part].notes.map((n) => ({ ...n, inst })))
    .filter((n) => n.midi >= PITCH_RANGE.low && n.midi <= PITCH_RANGE.high);
  if (!chosen.length) return;

  const step = chooseStep(chosen);
  controls.cols.set(Math.min(256, QUARTERS_PER_SCREEN / step));
  controls.duration.set(Math.min(60, Math.max(2, Math.round((QUARTERS_PER_SCREEN * 60) / score.bpm))));

  record();
  state.strokes = chosen.map((n) => noteStroke(n.inst, n.midi, Math.round(n.start / step), Math.max(1, Math.round(n.dur / step))));
  setSelection([]);
  const midis = chosen.map((n) => n.midi).sort((a, b) => a - b);
  centerViewOn(midis[Math.floor(midis.length / 2)]);
  view.x = 0;
  notesDirty = true;
}

document.getElementById('import-confirm').addEventListener('click', () => {
  const assignments = [...importDialog.querySelectorAll('select')]
    .filter((select) => select.value)
    .map((select) => ({ part: Number(select.dataset.part), inst: select.value }));
  importDialog.close();
  importScore(importDialog.score, assignments);
});
document.getElementById('import-cancel').addEventListener('click', () => importDialog.close());

/* ---- Export ---- */

document.querySelector('[data-action="export"]').addEventListener('click', () => {
  refreshNotes();
  if (!notes.length) return;
  const duration = (totalCols * state.duration) / state.cols;
  const xml = toMusicXML({ notes, cols: totalCols, duration, instruments: state.instruments, instrumentName });
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pantonal.musicxml';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* ---- Controls ---- */

function bindRange(key, format, onChange) {
  const input = document.getElementById(key);
  const output = input.nextElementSibling;
  const sync = () => (output.textContent = format(state[key]));
  input.value = state[key];
  sync();
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    sync();
    onChange();
  });
  return {
    set(value) {
      input.value = value;
      state[key] = Number(input.value);
      sync();
      onChange();
    },
    refresh: sync,
  };
}

function bindCheckbox(key, onChange = () => {}) {
  const input = document.getElementById(key);
  input.checked = state[key];
  input.addEventListener('change', () => {
    state[key] = input.checked;
    onChange();
  });
  return {
    set(value) {
      input.checked = value;
      state[key] = value;
      onChange();
    },
  };
}

// Octaves per screen is a zoom: keep the pitch at the centre of the screen.
let zoomOctaves = state.octaves;
function zoom() {
  const centerY = view.y + (6 * zoomOctaves) / PITCH_RANGE.rows;
  view.y = centerY - (6 * state.octaves) / PITCH_RANGE.rows;
  zoomOctaves = state.octaves;
  notesDirty = true; // steepness depends on the row height
}

const restartIfPlaying = () => state.playing && play();
const controls = {
  duration: bindRange('duration', (v) => t('settings.seconds', { n: v }), restartIfPlaying),
  octaves: bindRange('octaves', (v) => `${v}`, zoom),
  cols: bindRange('cols', (v) => `${v}`, () => {
    notesDirty = true;
    restartIfPlaying();
  }),
};
controls.grid = bindCheckbox('grid');
controls.loop = bindCheckbox('loop');

const applyVibrato = () => air.setVibrato(state.vibratoDepth, state.vibratoRate);
controls.vibratoDepth = bindRange('vibratoDepth', (v) => (v ? `${v}` : t('settings.off')), applyVibrato);
controls.vibratoRate = bindRange('vibratoRate', (v) => t('settings.perSecond', { n: v }), applyVibrato);
controls.showTheremin = bindCheckbox('showTheremin');

// The settings bar is hidden until asked for; this browser remembers the choice.
const settingsButton = document.querySelector('[data-action="settings"]');

function showSettings(show) {
  document.body.classList.toggle('settings-open', show);
  settingsButton.setAttribute('aria-pressed', String(show));
  try {
    localStorage.setItem('pantonal.settings', show ? 'shown' : 'hidden');
  } catch {
    // not remembered: fine
  }
}

settingsButton.addEventListener('click', () => showSettings(!document.body.classList.contains('settings-open')));
try {
  showSettings(localStorage.getItem('pantonal.settings') === 'shown');
} catch {
  showSettings(false);
}

/* ---- Playback ---- */

const playButton = document.getElementById('play');

function setPlayButton(playing) {
  playButton.querySelector('.icon').innerHTML = ICONS[playing ? 'stop' : 'play'];
  playButton.querySelector('.label').textContent = t(playing ? 'action.stop' : 'action.play');
  playButton.classList.toggle('active', playing);
}

function play() {
  stopPlayback(audio);
  state.playing = true;
  state.playCol = -1;
  const free = state.mode === 'free';
  refreshNotes();
  const stepDur = state.duration / (free ? FREE_COLS : state.cols);
  state.playDuration = totalCols * stepDur;
  startPlayback({
    cols: totalCols,
    duration: state.playDuration,
    isLoop: () => state.loop,
    playStep: free ? playFreeStep : playChromaticStep,
    onStep: (col) => (state.playCol = col),
    onEnd: stop,
  });
  setPlayButton(true);
}

function playChromaticStep(col, time, stepDur) {
  refreshNotes();
  const range = PITCH_RANGE;
  for (const note of byCol[col] ?? []) {
    audio.samplers[note.inst]?.triggerAttackRelease(mtof(rowToMidi(note.row, range)), note.len * stepDur * 0.95, time);
  }
}

function playFreeStep(col, time, stepDur) {
  refreshNotes();
  for (const voice of byCol[col] ?? []) {
    if (voice.kind === 'cluster') {
      const freqs = [];
      for (let midi = freeMidi(voice.bottom); midi <= freeMidi(voice.top) + 1e-6; midi++) freqs.push(mtof(midi));
      audio.samplers[voice.inst]?.triggerAttackRelease(freqs, CLUSTER_SECONDS, time);
    } else {
      const curve = voice.points.map((p) => ({ t: (p.col - voice.col) * stepDur, midi: freeMidi(p.y) }));
      const last = curve.at(-1);
      curve.push({ t: last.t + stepDur, midi: last.midi });
      audio.playGlide(voice.inst, curve, time);
    }
  }
}

function stop() {
  if (echo.active) echo.stop();
  if (air.running) air.stop();
  stopPlayback(audio);
  state.playing = false;
  state.playCol = -1;
  setPlayButton(false);
}

playButton.addEventListener('click', async () => {
  if (state.playing) return stop();
  if (state.mode === 'air') return startAir();
  const audioStarted = Tone.start(); // must be called inside the click
  audio ??= createAudio();
  // Instant once the session's sounds are loaded; the first time shows Loading.
  playButton.disabled = true;
  playButton.querySelector('.label').textContent = t('action.loading');
  try {
    await audioStarted;
    await audio.ready(state.instruments);
  } catch (err) {
    console.error('Could not load the sounds', err);
    playButton.disabled = false;
    setPlayButton(false);
    return;
  }
  playButton.disabled = false;
  play();
});

/* ---- Air Thinker ---- */

async function startAir() {
  Tone.start(); // must be called inside the click
  playButton.disabled = true;
  playButton.querySelector('.label').textContent = t('action.loading');
  airError = null;
  try {
    await Tone.start();
    await air.start({ depth: state.vibratoDepth, rate: state.vibratoRate });
    state.playing = true;
    setPlayButton(true);
  } catch (err) {
    airError = err.message;
    setPlayButton(false);
  } finally {
    playButton.disabled = false;
  }
}

// The mirrored camera image with the pitch scale, the hands, and a trace of
// the last few seconds of melody scrolling to the left.
function renderAir() {
  ctx.fillStyle = '#141416';
  ctx.fillRect(0, 0, W, H);

  // The camera image covers the stage; hand positions map onto it the same way.
  const video = air.video;
  let box = { x: 0, y: 0, w: W, h: H };
  if (air.running && video?.videoWidth) {
    const scale = Math.max(W / video.videoWidth, H / video.videoHeight);
    box = { w: video.videoWidth * scale, h: video.videoHeight * scale };
    box.x = (W - box.w) / 2;
    box.y = (H - box.h) / 2;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, box.x, box.y, box.w, box.h);
    ctx.restore();
  }
  const toStage = (p) => ({ x: box.x + p.x * box.w, y: box.y + p.y * box.h });

  // The pitch range spans the visible part of the image, with a small margin
  // at the top and room for the theremin's cabinet at the bottom.
  const visibleTop = -box.y / box.h;
  const visibleBottom = (H - box.y) / box.h;
  const margin = 0.08 * (visibleBottom - visibleTop);
  const bottomMargin = state.showTheremin ? Math.max(margin, 74 / box.h) : margin;
  setAirBand(visibleTop + margin, visibleBottom - bottomMargin);
  const yOfMidi = (midi) => box.y + yOfHeight((midi - AIR_LOW) / (AIR_HIGH - AIR_LOW)) * box.h;

  // Pitch scale: a line per semitone, labelled at each C. With a scale, its
  // notes stand out and the key note is yellow.
  const scaleNotes = SCALES[state.airScale].notes;
  const showKey = scaleNotes && scaleNotes.length < 12;
  ctx.font = '600 13px Fredoka, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (let midi = AIR_LOW; midi <= AIR_HIGH; midi++) {
    const y = yOfMidi(midi);
    const degree = (midi - state.airKey + 120) % 12;
    const isKey = showKey && degree === 0;
    const isC = midi % 12 === 0;
    const labelled = isC || isKey;
    ctx.strokeStyle = isKey ? 'rgba(242, 210, 46, 0.5)'
      : `rgba(255, 255, 255, ${isC ? 0.28 : scaleNotes?.includes(degree) ? 0.15 : 0.05})`;
    ctx.lineWidth = labelled ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(labelled ? 44 : 0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    if (labelled) {
      ctx.fillStyle = isKey ? 'rgba(242, 210, 46, 0.9)' : 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(noteName(midi), 10, y);
    }
  }

  // The melody so far: its head is the note sounding now.
  const now = performance.now() / 1000;
  const head = W - 90;
  const xOfTime = (t) => head - ((now - t) / air.traceSeconds) * (head - 60);
  if (air.running && state.showTheremin && airGuide.hidden) drawTheremin(head, yOfMidi, toStage, now);
  ctx.strokeStyle = '#2fb9d3';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let penDown = false;
  for (const { t, midi } of air.trace) {
    if (midi === null) {
      penDown = false;
      continue;
    }
    const x = xOfTime(t);
    const y = yOfMidi(midi);
    if (penDown) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    penDown = true;
  }
  ctx.stroke();

  // Echo game: a filled ring on the note being played to the player, a
  // hollow one on the note to find when a hint is due.
  if (echo.active) {
    echo.update(now);
    const ring = (midi, filled) => {
      ctx.strokeStyle = ctx.fillStyle = '#f2d22e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(head, yOfMidi(midi), 15, 0, Math.PI * 2);
      if (filled) ctx.fill();
      else ctx.stroke();
    };
    if (echo.phase === 'listen' && echo.listening >= 0) ring(echo.target[echo.listening], true);
    if (echo.phase === 'play' && echo.showTarget) ring(echo.target[echo.matched], false);
  }

  const sounding = air.running && air.sounding;
  if (sounding) {
    const y = yOfMidi(air.pitch);
    ctx.fillStyle = '#2fb9d3';
    ctx.beginPath();
    ctx.arc(head, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 26px Fredoka, system-ui, sans-serif';
    ctx.fillText(noteName(Math.round(air.pitch)), head + 20, y);
  }

  // The hands: the pitch hand glows while it plays, the volume hand in peach.
  for (const hand of air.hands) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (const point of hand) {
      const p = toStage(point);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const palm = toStage(hand[9]);
    const isPitch = hand === air.pitchHand;
    ctx.fillStyle = isPitch ? (air.open ? '#2fb9d3' : '#777') : '#f2a35e';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, isPitch ? 18 : 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // The theremin guide stays up until a hand is in view.
  const status = t(airError ?? (!air.running ? 'guide.press' : 'guide.show'));
  setAirGuide(airError !== null || !air.running || !air.hands.length, status, airError !== null);
}

// A theremin drawn into the camera view. Its antenna is the pitch scale, from
// C3 at its base to C6 at its tip, and the melody trace flows out of it; waves
// ripple toward the playing hand and the volume loop glows with the volume.
function drawTheremin(antennaX, yOfMidi, toStage, now) {
  const sounding = air.pitchHand && air.open;
  const top = yOfMidi(AIR_LOW) + 10; // the cabinet sits just below C3
  const tip = yOfMidi(AIR_HIGH);
  const cabinetW = Math.min(240, W * 0.28);
  const cabinetH = 36;
  const left = antennaX + 16 - cabinetW;
  const middle = top + cabinetH / 2;

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.lineCap = 'round';

  ctx.strokeStyle = '#e9e5dc';
  ctx.lineWidth = 3;
  for (const [from, to] of [[0.3, 0.2], [0.5, 0.5], [0.7, 0.8]]) {
    ctx.beginPath();
    ctx.moveTo(left + cabinetW * from, top + cabinetH);
    ctx.lineTo(left + cabinetW * to, top + cabinetH + 80);
    ctx.stroke();
  }

  ctx.fillStyle = '#4a3426';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(left, top, cabinetW, cabinetH, 9);
  else ctx.rect(left, top, cabinetW, cabinetH);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e9e5dc';
  for (const dx of [26, 46]) {
    ctx.beginPath();
    ctx.arc(left + dx, middle, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#f2a35e';
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.45 + 0.5 * (air.volumeHand ? air.volume : 0.3);
  ctx.beginPath();
  ctx.moveTo(left, middle);
  ctx.lineTo(left - 18, middle);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(left - 44, middle, 26, 10, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = ctx.fillStyle = '#2fb9d3';
  ctx.globalAlpha = sounding ? 0.95 : 0.6;
  ctx.beginPath();
  ctx.moveTo(antennaX, top);
  ctx.lineTo(antennaX, tip);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(antennaX, tip, 6, 0, Math.PI * 2);
  ctx.fill();

  if (sounding) {
    const y = yOfMidi(air.pitch);
    const palm = toStage(air.pitchHand[9]);
    const toward = Math.atan2(palm.y - y, palm.x - antennaX);
    const phase = (now * state.vibratoRate) % 1;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const step = (i + phase) / 3;
      ctx.globalAlpha = 0.6 * (1 - step);
      ctx.beginPath();
      ctx.arc(antennaX, y, 18 + step * 48, toward - 0.6, toward + 0.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* Scale and key */

const scaleButton = document.querySelector('[data-action="scale"]');
const scaleMenu = document.getElementById('scale-menu');

function applyScale() {
  const scale = SCALES[state.airScale];
  air.scale = scale.notes;
  air.key = state.airKey;
  if (echo.active) echo.setScale(scale.notes, state.airKey);
  const keyed = scale.notes && scale.notes.length < 12;
  const name = t(`scale.${state.airScale}`);
  scaleButton.querySelector('.label').textContent = keyed ? `${keyName(state.airKey)} · ${name}` : name;
}

function renderScaleMenu() {
  const scale = SCALES[state.airScale];
  const keyless = !scale.notes || scale.notes.length === 12;
  const pill = (label, selected, onClick, disabled = false) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.className = selected ? 'selected' : '';
    button.disabled = disabled;
    button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => {
      onClick();
      applyScale();
      renderScaleMenu();
    });
    return button;
  };
  const groups = {};
  for (const [id, s] of Object.entries(SCALES)) (groups[s.group] ??= []).push([id, s]);
  document.getElementById('scale-options').replaceChildren(...Object.entries(groups).flatMap(([group, scales]) => {
    const heading = document.createElement('h4');
    heading.textContent = t(`group.${group}`);
    const pills = document.createElement('div');
    pills.className = 'pills';
    pills.append(...scales.map(([id]) => pill(t(`scale.${id}`), id === state.airScale, () => (state.airScale = id))));
    return [heading, pills];
  }));
  document.getElementById('key-options').replaceChildren(...Array.from({ length: 12 }, (_, key) => pill(
    keyName(key), !keyless && key === state.airKey, () => (state.airKey = key), keyless,
  )));
  const fact = document.createElement('strong');
  fact.textContent = `${t('scale.didYouKnow')} `;
  document.getElementById('scale-fact').replaceChildren(fact, t(`fact.${state.airScale}`));

  const hint = { free: 'scale.hint.free', chromatic: 'scale.hint.chromatic' }[state.airScale]
    ?? { ragas: 'scale.hint.raga', makams: 'scale.hint.makam' }[scale.group] ?? 'scale.hint.scale';
  document.getElementById('scale-hint').textContent = t(hint, { key: keyName(state.airKey), scale: t(`scale.${state.airScale}`) });
}

function toggleScaleMenu(open = scaleMenu.hidden) {
  scaleMenu.hidden = !open;
  scaleButton.setAttribute('aria-expanded', String(open));
  if (!open) return;
  renderScaleMenu();
  const stage = document.getElementById('stage').getBoundingClientRect();
  scaleMenu.style.left = `${Math.max(8, scaleButton.getBoundingClientRect().left - stage.left)}px`;
}

scaleButton.addEventListener('click', () => toggleScaleMenu());

// Plays the scale up and down from its key note, or a slow glide for Free.
document.getElementById('scale-hear').addEventListener('click', () => {
  Tone.start(); // must be called inside the click
  const scale = SCALES[state.airScale];
  if (!scale.notes) {
    air.playPhrase([60, 72, 60], 1.2, { glide: true });
    return;
  }
  const root = 60 + state.airKey;
  const up = [...scale.notes.map((n) => root + n), root + 12];
  air.playPhrase([...up, ...up.slice(0, -1).reverse()], 0.28);
});

/* Echo game */

const echoButton = document.querySelector('[data-action="echo"]');

echoButton.addEventListener('click', async () => {
  if (echo.active) {
    echo.stop();
    return;
  }
  toggleScaleMenu(false);
  if (!air.running) await startAir();
  if (air.running) echo.start(SCALES[state.airScale].notes, state.airKey);
});

for (const button of document.querySelectorAll('[data-echo]')) {
  button.addEventListener('click', () => (button.dataset.echo === 'replay' ? echo.replay() : echo.next()));
}

echo.onChange = () => {
  const panel = document.getElementById('echo-panel');
  panel.hidden = !echo.active;
  echoButton.setAttribute('aria-pressed', String(echo.active));
  if (!echo.active) return;
  document.getElementById('echo-dots').replaceChildren(...echo.target.map((_, i) => {
    const dot = document.createElement('span');
    if (i < echo.matched) dot.className = 'done';
    else if (i === echo.matched && echo.phase === 'play') dot.className = 'next';
    return dot;
  }));
  const status = {
    listen: t('echo.listen'),
    play: echo.hint ? t(`echo.${echo.hint}`) : t('echo.yourTurn', { n: echo.target.length }),
    success: t('echo.success', { n: echo.length }),
  }[echo.phase] ?? '';
  document.getElementById('echo-status').textContent = status;
  for (const button of panel.querySelectorAll('button')) button.disabled = echo.phase === 'listen';
};
document.addEventListener('pointerdown', (e) => {
  if (!scaleMenu.hidden && !scaleMenu.contains(e.target) && !scaleButton.contains(e.target)) toggleScaleMenu(false);
});
applyScale();

const airGuide = document.getElementById('air-guide');
const airGuideStatus = document.getElementById('air-guide-status');

function setAirGuide(show, status, isError) {
  if (airGuide.hidden === !show && airGuideStatus.textContent === status) return;
  airGuide.hidden = !show;
  airGuideStatus.textContent = status;
  airGuideStatus.style.color = isError ? '#f2a35e' : '';
}

/* ---- Mode ---- */

const modeDialog = document.getElementById('mode-dialog');

function openModeDialog() {
  openModeDialog.refresh();
  for (const b of modeDialog.querySelectorAll('[data-mode]')) b.classList.toggle('current', b.dataset.mode === state.mode);
  modeDialog.showModal();
}

openModeDialog.refresh = () => {
  const continueButton = document.getElementById('mode-continue');
  continueButton.hidden = Boolean(state.mode) || !savedSession?.strokes.length;
  if (!continueButton.hidden) {
    continueButton.querySelector('small').textContent = `${t(`mode.${savedSession.mode}`)} · ${timeAgo(savedSession.savedAt)}`;
  }
  document.getElementById('mode-warning').hidden = !state.mode || !state.strokes.length;
  document.getElementById('mode-cancel').hidden = !state.mode;
};

// Switching mode starts from an empty canvas and history.
function setMode(mode) {
  modeDialog.close();
  if (mode === state.mode) return;
  stop();
  state.mode = mode;
  document.body.dataset.mode = mode;
  airGuide.hidden = true; // renderAir shows it in Air Thinker
  toggleScaleMenu(false);
  state.strokes = [];
  state.tool = 'brush';
  setInstruments([...DEFAULT_INSTRUMENTS], defaultColors());
  view.x = view.y = 0;
  if (mode === 'chromatic') centerViewOn(60);
  undoStack.length = 0;
  redoStack.length = 0;
  clipboard = null;
  lastPaste = null;
  closeScoreMenu();
  syncToolbar();
  syncHistoryButtons();
  notesDirty = true;
}

for (const button of modeDialog.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => setMode(button.dataset.mode));
}
document.getElementById('mode-cancel').addEventListener('click', () => modeDialog.close());

// About opens from the logo and from the mode chooser, on top of it.
const aboutDialog = document.getElementById('about-dialog');
for (const button of document.querySelectorAll('[data-action="about"]')) {
  button.addEventListener('click', () => aboutDialog.showModal());
}
document.getElementById('about-close').addEventListener('click', () => aboutDialog.close());
modeDialog.addEventListener('cancel', (e) => {
  if (!state.mode) e.preventDefault(); // a mode must be chosen on first open
});
document.querySelector('[data-action="mode"]').addEventListener('click', openModeDialog);

/* ---- Session ---- */

// The session is kept in this browser's localStorage (cookies hold ~4 KB,
// too little for a drawing). Storage can be unavailable, e.g. when blocked
// or in some private windows, so every access is guarded.
const SESSION_KEY = 'pantonal.session';
const SESSION_VERSION = 1;
const round = (v) => Math.round(v * 1e4) / 1e4;

let savedSession = loadSession();
let lastSaved = null; // what this page last wrote
let lastCheap = null; // small settings at the last save check

function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (session?.version === SESSION_VERSION && ['free', 'chromatic'].includes(session.mode)) return session;
  } catch {
    // no usable session
  }
  return null;
}

// Strokes are stored as flat [x, y, x, y, ...] lists, rounded, to save space.
function sessionBody() {
  return JSON.stringify({
    version: SESSION_VERSION,
    mode: state.mode,
    instruments: state.instruments,
    colors: state.colors,
    inst: state.inst,
    cols: state.cols,
    octaves: state.octaves,
    duration: state.duration,
    grid: state.grid,
    loop: state.loop,
    view: { x: round(view.x), y: round(view.y) },
    strokes: state.strokes.map((s) => ({ inst: s.inst, points: s.points.flatMap((p) => [round(p.x), round(p.y)]) })),
  });
}

function saveSession() {
  if (!state.mode || state.mode === 'air' || drawing.size || selectGesture || panGesture) return;
  // A fresh, still empty session never replaces the saved drawing.
  if (!state.strokes.length && lastSaved === null) return;
  // Building the body is costly for big drawings: only do it after a change.
  const cheap = [state.mode, state.inst, state.duration, state.grid, state.loop, round(view.x), round(view.y)].join();
  if (!sessionChanged && cheap === lastCheap) return;
  sessionChanged = false;
  lastCheap = cheap;
  const body = sessionBody();
  if (body === lastSaved) return;
  try {
    localStorage.setItem(SESSION_KEY, body.replace(/}$/, `,"savedAt":${Date.now()}}`));
    lastSaved = body;
  } catch {
    // storage full or unavailable: keep working without saving
  }
}

function restoreSession(session) {
  setMode(session.mode);
  if (session.mode === 'chromatic') {
    controls.cols.set(session.cols);
    controls.duration.set(session.duration);
    controls.octaves.set(session.octaves);
    controls.grid.set(session.grid);
    controls.loop.set(session.loop);
  }
  // Sessions saved before instruments could be added have none listed.
  const ids = (session.instruments ?? DEFAULT_INSTRUMENTS).filter((id) => id in LIBRARY).slice(0, MAX_INSTRUMENTS);
  if (ids.length) setInstruments(ids, { ...defaultColors(), ...session.colors });
  state.inst = ids.includes(session.inst) ? session.inst : state.instruments[0];
  state.strokes = session.strokes.filter(({ inst }) => state.instruments.includes(inst)).map(({ inst, points }) => ({
    inst,
    points: Array.from({ length: points.length / 2 }, (_, i) => ({ x: points[2 * i], y: points[2 * i + 1] })),
  }));
  Object.assign(view, session.view);
  lastSaved = sessionBody();
  syncToolbar();
  notesDirty = true;
}

function timeAgo(time) {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (!time || minutes < 1) return t('time.now');
  if (minutes < 60) return t('time.minutes', { n: minutes });
  if (minutes < 60 * 24) return t('time.hours', { n: Math.round(minutes / 60) });
  return new Date(time).toLocaleDateString(language());
}

document.getElementById('mode-continue').addEventListener('click', () => restoreSession(savedSession));
setInterval(saveSession, 1000);
window.addEventListener('pagehide', saveSession);

/* ---- Language ---- */

for (const picker of document.querySelectorAll('.language-picker')) {
  picker.replaceChildren(...Object.entries(LANGUAGES).map(([code, { name }]) => {
    const button = document.createElement('button');
    button.dataset.language = code;
    button.lang = code;
    button.textContent = name;
    button.addEventListener('click', () => setLanguage(code));
    return button;
  }));
}
translatePage(); // marks the current language in the pickers

// Everything built by script is rebuilt in the new language; the page's own
// text is updated by translatePage.
onLanguageChange(() => {
  buildInstrumentRail();
  buildScoreMenu();
  applyScale();
  if (!scaleMenu.hidden) renderScaleMenu();
  if (instrumentsDialog.open) renderInstrumentsDialog();
  if (modeDialog.open) openModeDialog.refresh();
  for (const control of Object.values(controls)) control.refresh?.();
  setPlayButton(state.playing);
  echo.onChange();
});

buildInstrumentRail();
syncHistoryButtons();
requestAnimationFrame(render);
openModeDialog();
