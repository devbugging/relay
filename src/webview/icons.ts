// Inline stroke icons. Each returns an <svg> string that inherits currentColor.
const wrap = (body: string, box = 16) =>
  `<svg viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  plus: wrap('<path d="M8 3v10M3 8h10"/>'),
  fork: wrap('<circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="6" r="1.6"/><path d="M4 5.1v5.8M4 11c0-3 8-1.5 8-3.4"/>'),
  stop: `<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1"/></svg>`,
  copy: wrap('<rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 10V3h7"/>'),
  attach: wrap('<path d="M10.5 5.5L6 10a1.5 1.5 0 002.1 2.1l5-5a3 3 0 00-4.2-4.2L3.4 8.4a4.5 4.5 0 006.4 6.4"/>'),
  send: wrap('<path d="M8 13V3M4 7l4-4 4 4"/>'),
  chevron: wrap('<path d="M3 4.5l3 3 3-3"/>', 12),
  check: wrap('<path d="M2.5 6.5l2.3 2.3L9.5 3.8"/>', 12),
  clock: wrap('<circle cx="6" cy="6" r="5"/><path d="M6 3.2v3.2l2 1.2"/>', 12),
  cross: wrap('<path d="M3 3l6 6M9 3l-6 6"/>', 12),
  eye: wrap('<path d="M1.5 6s1.8-3 4.5-3 4.5 3 4.5 3-1.8 3-4.5 3S1.5 6 1.5 6z"/><circle cx="6" cy="6" r="1.4"/>', 12),
  pencil: wrap('<path d="M8.5 1.5l2 2L4 10H2V8z"/>', 12),
  terminal: wrap('<path d="M2 3l3 3-3 3M6.5 9H10"/>', 12),
};
