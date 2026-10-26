/* global Tone */

// A percussion loop (a bendir usul, played by Ozan) to improvise over in Air
// Thinker. Its speed can change a little; playing a recording faster also
// raises its pitch, so the range stays narrow.

const LOOP = 'samples/usul/usul.flac';

export function createRhythm() {
  const rhythm = { playing: false };
  let output = null;
  let player = null;
  let ready = null; // resolves to whether the loop loaded
  let volume = 0.5;
  let speed = 1;
  let request = 0; // only the latest start() may start the loop

  rhythm.setVolume = (value) => {
    volume = value;
    output?.gain.rampTo(value, 0.2);
  };

  rhythm.setSpeed = (value) => {
    speed = value;
    if (player) player.playbackRate = value;
  };

  rhythm.start = async () => {
    rhythm.playing = true;
    const current = ++request;
    if (!output) output = new Tone.Gain(volume).connect(new Tone.Limiter(-3).toDestination());
    ready ??= new Promise((resolve) => {
      player = new Tone.Player({ url: LOOP, loop: true, fadeIn: 0.05, fadeOut: 0.4, onload: () => resolve(true), onerror: () => resolve(false) })
        .connect(output);
    });
    const loaded = await ready;
    if (!loaded || current !== request) return;
    player.playbackRate = speed;
    player.start();
  };

  rhythm.stop = () => {
    rhythm.playing = false;
    request++;
    if (player?.state === 'started') player.stop();
  };

  return rhythm;
}
