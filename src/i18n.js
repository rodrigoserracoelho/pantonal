import en from './i18n/en.js';
import fr from './i18n/fr.js';
import pt from './i18n/pt.js';
import nl from './i18n/nl.js';

// Interface languages. Note names follow each language's music teaching:
// fixed solfège in French and Portuguese, letters with Dutch accidentals in
// Dutch. French and Portuguese also number octaves so middle C is 3.
export const LANGUAGES = {
  en: { name: 'English', strings: en, octaveOffset: 0, notes: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] },
  fr: { name: 'Français', strings: fr, octaveOffset: -1, notes: ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'] },
  pt: { name: 'Português', strings: pt, octaveOffset: -1, notes: ['Dó', 'Dó♯', 'Ré', 'Mi♭', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Lá♭', 'Lá', 'Si♭', 'Si'] },
  nl: { name: 'Nederlands', strings: nl, octaveOffset: 0, notes: ['C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'As', 'A', 'Bes', 'B'] },
};

const STORAGE_KEY = 'pantonal.language';
const listeners = [];

// A language saved in this browser, else the first of the device's
// languages we have, else English.
function detect() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved in LANGUAGES) return saved;
  } catch {
    // storage unavailable
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag?.slice(0, 2).toLowerCase();
    if (code in LANGUAGES) return code;
  }
  return 'en';
}

let current = detect();

export const language = () => current;

// The text for `key` in the current language (English if missing), with
// {name} placeholders filled from `params`.
export function t(key, params = {}) {
  const text = LANGUAGES[current].strings[key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

export const keyName = (pitchClass) => LANGUAGES[current].notes[pitchClass];
export const noteName = (midi) => LANGUAGES[current].notes[((midi % 12) + 12) % 12]
  + (Math.floor(midi / 12) - 1 + LANGUAGES[current].octaveOffset);

export const onLanguageChange = (listener) => listeners.push(listener);

export function setLanguage(code) {
  if (!(code in LANGUAGES) || code === current) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // not remembered: fine
  }
  translatePage();
  listeners.forEach((listener) => listener());
}

// Links used inside translated HTML (the About credits).
function links() {
  const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  return {
    ccby: a('https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0'),
    ccby4: a('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0'),
    soundfonts: a('https://github.com/gleitz/midi-js-soundfonts', 'midi-js-soundfonts'),
    freesound: a('https://freesound.org/people/sankalp/sounds/153262/', 'Freesound'),
    tone: a('https://tonejs.github.io/', 'Tone.js'),
    mediapipe: a('https://ai.google.dev/edge/mediapipe', 'MediaPipe'),
    fredoka: a('https://fonts.google.com/specimen/Fredoka', 'Fredoka'),
    github: a('https://github.com/rodrigoserracoelho/pantonal', t('about.github')),
  };
}

// Fills elements marked in the page: data-i18n (text), data-i18n-html (our
// own markup, from keys ending in .html) and data-i18n-attr
// ("attribute:key;attribute:key").
export function translatePage(root = document) {
  document.documentElement.lang = current;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  const params = links();
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml, params);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attribute, key] = pair.split(':');
      el.setAttribute(attribute, t(key));
    }
  }
  for (const button of root.querySelectorAll('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === current));
  }
}
