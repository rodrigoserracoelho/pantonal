// Melodies as "NOTE:steps" tokens ("r" is a rest). `stepsPerBeat` sets the
// grid resolution and `bpm` the tempo, so loading a score sets both.
export const SCORES = [
  {
    title: 'Ode to Joy',
    composer: 'Beethoven',
    bpm: 110,
    stepsPerBeat: 2,
    notes: `E4:2 E4:2 F4:2 G4:2 G4:2 F4:2 E4:2 D4:2 C4:2 C4:2 D4:2 E4:2 E4:3 D4:1 D4:4
            E4:2 E4:2 F4:2 G4:2 G4:2 F4:2 E4:2 D4:2 C4:2 C4:2 D4:2 E4:2 D4:3 C4:1 C4:4`,
  },
  {
    title: 'Für Elise',
    composer: 'Beethoven',
    bpm: 65,
    stepsPerBeat: 4,
    notes: `E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 r:1 C4:1 E4:1 A4:1 B4:2 r:1
            E4:1 G#4:1 B4:1 C5:2 r:1 E4:1 E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1
            A4:2 r:1 C4:1 E4:1 A4:1 B4:2 r:1 E4:1 C5:1 B4:1 A4:4`,
  },
  {
    title: 'Minuet in G',
    composer: 'Petzold (attr. Bach)',
    bpm: 110,
    stepsPerBeat: 2,
    notes: `D5:2 G4:1 A4:1 B4:1 C5:1 D5:2 G4:2 G4:2 E5:2 C5:1 D5:1 E5:1 F#5:1 G5:2 G4:2 G4:2
            C5:2 D5:1 C5:1 B4:1 A4:1 B4:2 C5:1 B4:1 A4:1 G4:1 F#4:2 G4:1 A4:1 B4:1 G4:1 A4:6`,
  },
  {
    title: 'Twinkle, Twinkle',
    composer: 'Traditional',
    bpm: 100,
    stepsPerBeat: 2,
    notes: `C4:2 C4:2 G4:2 G4:2 A4:2 A4:2 G4:4 F4:2 F4:2 E4:2 E4:2 D4:2 D4:2 C4:4
            G4:2 G4:2 F4:2 F4:2 E4:2 E4:2 D4:4 G4:2 G4:2 F4:2 F4:2 E4:2 E4:2 D4:4
            C4:2 C4:2 G4:2 G4:2 A4:2 A4:2 G4:4 F4:2 F4:2 E4:2 E4:2 D4:2 D4:2 C4:4`,
  },
];

export function parseScore(score) {
  let step = 0;
  const notes = [];
  for (const token of score.notes.trim().split(/\s+/)) {
    const [name, len] = token.split(':');
    if (name !== 'r') notes.push({ name, step, len: Number(len) });
    step += Number(len);
  }
  return { notes, totalSteps: step };
}
