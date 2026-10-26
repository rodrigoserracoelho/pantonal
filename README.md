<p align="center">
  <img src="assets/logo/pantonal-mark.svg" alt="" width="96" height="96">
</p>

# Pantonal

Pantonal turns drawings into music. Draw lines on a canvas and hear them
played: left to right is time, bottom to top is pitch. It's made for touch
screens and for kids, and runs in any modern browser.

Try it at **[pantonal.app](https://pantonal.app)**. Contributions and ideas are
welcome: open an [issue](https://github.com/rodrigoserracoelho/pantonal/issues) or a pull request.

## About

Pantonal was inspired by an interactive drawing-to-music installation at the
[House of Music Hungary](https://zenehaza.hu/en) (Magyar Zene Háza) in Budapest,
discovered during a visit in October 2026. It stood in the exhibition's section
on twelve-note music, hence the name.

Pantonal is an independent project, not affiliated with the House of Music Hungary.

## Three ways to play

- **Free Thinker**: one canvas, no grid. Lines glide through every pitch, and
  vertical lines ring as clusters.
- **Chromatic Thinker**: the twelve notes of the chromatic scale on a grid,
  with instrument layers, select / copy / paste for ostinatos, a canvas that
  scrolls in time and pitch, famous melodies to start from, MusicXML import, and
  export to MuseScore with no key or time signature.
- **Air Thinker**: a theremin played with your hands in front of the camera.
  One hand sets the pitch (close it to stop the sound), the other the volume,
  with adjustable vibrato. Pitch glides freely like the real instrument, or
  snaps to a scale in any key: major, the minors (natural, harmonic, melodic,
  Hungarian…), pentatonic, the modes, Turkish makams such as Hicaz, or Indian
  ragas such as Yaman, Bhairav and Malkauns. Each scale can be heard and comes
  with a short "Did you know?", and the **Echo** game plays a phrase for the
  player to echo with their hand. A synthesized **drone** follows the key and
  scale to improvise over: a tanpura for ragas, a ney-like held tonic (dem)
  for makams, and a root-and-fifth drone for everything else; ragas with Pa use a
  real tanpura recording. A **rhythm** loop, a bendir played by Ozan, can play
  along at an adjustable speed. Hand tracking runs entirely in the browser; the
  camera image never leaves the device.

The drawing modes autosave in the browser, support undo and redo, and let each
drawing use up to six instruments from a library of 23.

## Languages

Pantonal speaks **English, French, Portuguese (European) and Dutch**. It picks
the device's language on the first visit; the picker in the mode chooser and in
About changes it, and the browser remembers the choice. Note names follow each
language's music teaching: Do Ré Mi in French and Do3 for middle C, Dó Ré Mi in
Portuguese (Dó3), and C, Cis, Es, Bes… in Dutch.

Translations live in `src/i18n/`, one file per language with the same keys as
`en.js`. To improve a translation, edit its file; to add a language, copy
`en.js`, translate it and register it in `src/i18n.js` (name and note names).
Corrections from native speakers are very welcome.

## Running

Plain HTML, CSS and JavaScript: no build step and no dependencies to install.
Serve the folder over HTTP (ES modules don't load from `file://`):

```sh
python3 -m http.server 5173
```

Then open http://localhost:5173. Everything is served from this folder, so it
works offline.

To deploy, copy `index.html`, `style.css`, `manifest.webmanifest`, `src/`,
`vendor/`, `samples/`, `assets/`, `LICENSE` and `README.md` to any static web
host.

## Project layout

| Path | What's there |
|---|---|
| `src/main.js` | Canvas, tools, toolbar, dialogs, playback wiring, session saving |
| `src/music.js` | Instrument library, pitch mapping, turning lines into notes, audio engine |
| `src/musicxml.js`, `src/importxml.js` | MusicXML export and import |
| `src/air.js` | Air Thinker: camera, hand tracking, the theremin voice and the scales |
| `src/echo.js` | Air Thinker's Echo game |
| `src/drone.js` | Air Thinker's drones: tanpura, dem and shruti |
| `src/rhythm.js` | Air Thinker's bendir rhythm loop |
| `src/scores.js` | Built-in melodies |
| `src/icons.js` | The interface icons |
| `src/i18n.js`, `src/i18n/` | Languages: translation files, note names, the language picker |
| `samples/` | Instrument recordings |
| `assets/`, `design/logo/` | Logo, app icons and the logo concepts |

## License and credits

Pantonal's code is MIT licensed (see [LICENSE](LICENSE)). That license covers
the Pantonal source only; bundled third-party files keep their own licenses:

- `vendor/Tone.js`: [Tone.js](https://tonejs.github.io/) 14.8.49 by Yotam Mann, MIT.
- `vendor/mediapipe/`: [MediaPipe](https://ai.google.dev/edge/mediapipe) Tasks Vision 0.10.35
  and the Hand Landmarker model by Google, Apache License 2.0 (see
  `vendor/mediapipe/LICENSE-Apache-2.0.txt`).
- `vendor/fonts/`: [Fredoka](https://fonts.google.com/specimen/Fredoka) SemiBold (Latin subset),
  SIL Open Font License 1.1 (see `vendor/fonts/Fredoka-OFL.txt`).
- `samples/piano/`: Salamander Grand Piano by Alexander Holm, CC BY 3.0.
- `samples/usul/`: bendir loop played by Ozan, CC BY 4.0.
- `samples/tanpura/`: loop from "Tanpura 10" by sankalp on [Freesound](https://freesound.org/people/sankalp/sounds/153262/), CC0.
- Every other folder in `samples/` (choir, flute and the 20 library
  instruments): FluidR3_GM soundfont by Frank Wen, via
  [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), CC BY 3.0.

Details and source links are in [samples/CREDITS.md](samples/CREDITS.md).
