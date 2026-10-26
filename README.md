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
  ragas such as Yaman, Bhairav and Malkauns. Hand tracking runs entirely in the browser; the
  camera image never leaves the device.

The drawing modes autosave in the browser, support undo and redo, and let each
drawing use up to six instruments from a library of 23.

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
| `src/air.js` | Air Thinker: camera, hand tracking and the theremin voice |
| `src/scores.js` | Built-in melodies |
| `src/icons.js` | The interface icons |
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
- Every other folder in `samples/` (choir, flute and the 20 library
  instruments): FluidR3_GM soundfont by Frank Wen, via
  [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), CC BY 3.0.

Details and source links are in [samples/CREDITS.md](samples/CREDITS.md).
