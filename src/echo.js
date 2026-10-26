// Echo game for Air Thinker: Pantonal plays a short phrase from the current
// scale, and the player echoes it with the hand. A note counts once the pitch
// rests on it for a moment; each success makes the next phrase one note longer.

const NOTE_SECONDS = 0.6; // length of each note when Pantonal plays the phrase
const HOLD_SECONDS = 0.35; // how long the pitch must rest on a note to count
const HINT_AFTER = 4; // seconds on one note before its target ring appears
const FIRST_LENGTH = 3;
const MAX_LENGTH = 6;
const PENTATONIC = [0, 2, 4, 7, 9];

export function createEcho(air) {
  const echo = {
    active: false,
    phase: 'idle', // 'listen' | 'play' | 'success'
    target: [], // midi notes of the phrase
    matched: 0, // how many have been echoed
    listening: -1, // the note being played to the player, while listening
    hint: null, // 'higher' | 'lower' after a wrong note
    showTarget: false, // ring the next note on the antenna
    length: FIRST_LENGTH,
    onChange: () => {},
  };

  let pool = [];
  let timer = null;
  let listenStart = 0;
  let noteStart = 0;
  let candidate = null;
  let candidateSince = 0;
  let judged = false;

  const changed = () => echo.onChange();

  // The notes phrases are made of: one octave of the scale (pentatonic when
  // the scale doesn't name notes) from a key note between G3 and F#4.
  echo.setScale = (scaleNotes, key) => {
    const notes = scaleNotes && scaleNotes.length < 12 ? scaleNotes : PENTATONIC;
    const root = 55 + ((key - 7 + 12) % 12);
    pool = [...notes.map((n) => root + n), root + 12];
    if (echo.active) newRound();
  };

  echo.start = (scaleNotes, key) => {
    echo.active = true;
    echo.length = FIRST_LENGTH;
    echo.setScale(scaleNotes, key);
  };

  echo.stop = () => {
    clearTimeout(timer);
    echo.active = false;
    echo.phase = 'idle';
    changed();
  };

  echo.replay = () => echo.active && listen();
  echo.next = () => echo.active && newRound();

  // Small steps up and down the scale, never the same note twice in a row.
  function makePhrase() {
    let i = Math.floor(Math.random() * Math.ceil(pool.length / 2));
    const phrase = [pool[i]];
    while (phrase.length < echo.length) {
      const step = [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
      let next = Math.min(pool.length - 1, Math.max(0, i + step));
      if (next === i) next = i > 0 ? i - 1 : i + 1;
      i = next;
      phrase.push(pool[i]);
    }
    return phrase;
  }

  function newRound() {
    echo.target = makePhrase();
    echo.matched = 0;
    listen();
  }

  function listen() {
    clearTimeout(timer);
    echo.phase = 'listen';
    echo.hint = null;
    echo.showTarget = false;
    listenStart = performance.now() / 1000;
    const seconds = air.playPhrase(echo.target, NOTE_SECONDS);
    timer = setTimeout(() => {
      echo.phase = 'play';
      echo.listening = -1;
      noteStart = performance.now() / 1000;
      candidate = null;
      changed();
    }, (seconds + 0.4) * 1000);
    changed();
  }

  // Called every frame with the time in seconds.
  echo.update = (now) => {
    if (echo.phase === 'listen') {
      const i = Math.floor((now - listenStart) / NOTE_SECONDS);
      echo.listening = i < echo.target.length ? i : -1;
      return;
    }
    if (echo.phase !== 'play') return;
    if (!echo.showTarget && now - noteStart > HINT_AFTER) {
      echo.showTarget = true;
      changed();
    }
    if (!air.sounding) {
      candidate = null;
      return;
    }
    const note = Math.round(air.pitch);
    if (note !== candidate) {
      candidate = note;
      candidateSince = now;
      judged = false;
      return;
    }
    if (judged || now - candidateSince < HOLD_SECONDS) return;
    judged = true;

    const want = echo.target[echo.matched];
    if (note === want) {
      echo.matched++;
      echo.hint = null;
      echo.showTarget = false;
      noteStart = now;
      if (echo.matched === echo.target.length) {
        echo.phase = 'success';
        echo.length = Math.min(MAX_LENGTH, echo.length + 1);
        timer = setTimeout(newRound, 2200);
      }
    } else {
      echo.hint = note < want ? 'higher' : 'lower';
      echo.showTarget = true;
    }
    changed();
  };

  return echo;
}
