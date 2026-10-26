// Rounded line icons on a 24 × 24 grid, drawn in currentColor. Elements with
// data-icon="name" get the matching icon when the page starts.

const icon = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  mode: icon('<path d="M4 8h13"/><path d="M14 5l3 3-3 3"/><path d="M20 16H7"/><path d="M10 13l-3 3 3 3"/>'),
  undo: icon('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: icon('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  clear: icon('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  score: icon('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  export: icon('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  settings: icon('<path d="M4 6h9"/><path d="M17 6h3"/><circle cx="15" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="17" cy="18" r="2"/>'),
  play: icon('<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/>'),
  stop: icon('<rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor"/>'),
  brush: icon('<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>'),
  erase: icon('<path d="M8 20h12"/><path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 20H8.5z"/><path d="M9 11l5.5 5.5"/>'),
  select: icon('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3.4"/>'),
  pan: icon('<path d="M12 3v18"/><path d="M3 12h18"/><path d="M9 6l3-3 3 3"/><path d="M9 18l3 3 3-3"/><path d="M6 9l-3 3 3 3"/><path d="M18 9l3 3-3 3"/>'),
  piano: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 13v6"/><path d="M15 13v6"/><rect x="7.5" y="5" width="3" height="8" rx="0.5" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3" height="8" rx="0.5" fill="currentColor" stroke="none"/>'),
  chorus: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M9 21h6"/>'),
  flute: icon('<path d="M3.5 18.5L17 5l2 2L5.5 20.5z"/><circle cx="9.5" cy="14.5" r="0.6" fill="currentColor"/><circle cx="12.5" cy="11.5" r="0.6" fill="currentColor"/><circle cx="15.5" cy="8.5" r="0.6" fill="currentColor"/>'),
  free: icon('<path d="M3 15c3-8 5-8 7-3s4 5 6 0 3-5 5-3"/>'),
  hand: icon('<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>'),
  instruments: icon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>'),
  mallets: icon('<path d="M5 20l8.5-8.5"/><circle cx="15.5" cy="9.5" r="2.5"/><path d="M19 20l-8.5-8.5"/><circle cx="8.5" cy="9.5" r="2.5"/>'),
  bells: icon('<path d="M6 17v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/><path d="M12 3v3"/>'),
  organ: icon('<path d="M4 21h16"/><path d="M6 21v-9"/><path d="M10 21V5"/><path d="M14 21V8"/><path d="M18 21v-6"/>'),
  guitar: icon('<circle cx="9" cy="15" r="5"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/><path d="M12.5 11.5L19 5"/><path d="M17.5 3.5l3 3"/>'),
  harp: icon('<path d="M6 21V4c6 0 11 6 13 13l-13 4"/><path d="M9.5 7.5v11.5"/><path d="M13 10v8"/><path d="M16 13.5v4"/>'),
  strings: icon('<path d="M12 2v7"/><path d="M9 9.5a3 2.5 0 0 1 6 0c0 1.2-1 1.6-1 2.6s2 1.4 2 4a4 4 0 0 1-8 0c0-2.6 2-3 2-4s-1-1.4-1-2.6z"/><path d="M10.5 17h3"/>'),
  brass: icon('<path d="M3 10v4"/><path d="M3 12h11"/><path d="M14 9l7-4v14l-7-4z"/><path d="M7 12V8"/><path d="M10 12V8"/>'),
  reed: icon('<path d="M10 2h4"/><path d="M12 2v14"/><path d="M8.5 21h7L12 16z"/><circle cx="14.5" cy="7" r="0.8" fill="currentColor"/><circle cx="14.5" cy="10.5" r="0.8" fill="currentColor"/>'),
  drum: icon('<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v7c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/><circle cx="12" cy="8" r="1" fill="currentColor"/>'),
};

export function applyIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = ICONS[el.dataset.icon];
}
