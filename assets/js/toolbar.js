// The toolbar: one panel for everything the keyboard can do. It opens with ctrl + space or the
// Menu button. Type to narrow it down, move with the arrow keys, press enter to run the highlighted
// action. `actions()` is asked for a fresh list each time it opens, so it can depend on where you are:
//   { group, label, keys, find, run }     keys is the shortcut shown on the button, find is extra search text
// `onFilter(text)` is told what has been typed, and '' when the toolbar closes.

const css = `
.tb { position: fixed; left: 50%; bottom: 22px; z-index: 40; translate: -50% 0; width: min(760px, calc(100vw - 24px)); max-height: min(70dvh, 560px); display: flex; flex-direction: column; gap: 12px; padding: 14px;
  background: var(--card, var(--paper, #0e1422)); color: var(--ink, #eef2fa); border: 1px solid var(--rule, rgb(255 255 255 / .15)); border-radius: 16px; box-shadow: 0 24px 70px rgb(0 0 0 / .5); font: 14px/1.3 var(--body, system-ui, sans-serif);
  transition: opacity .18s, translate .22s var(--ease, ease); }
.tb[hidden] { display: flex !important; opacity: 0; translate: -50% 14px; pointer-events: none; visibility: hidden; transition: opacity .18s, translate .22s, visibility 0s .22s; }
.tb-find { width: 100%; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--rule, rgb(255 255 255 / .15)); background: rgb(127 127 127 / .12); color: inherit; font: 500 15px/1.2 var(--body, system-ui, sans-serif); outline: 0; }
.tb-find:focus { border-color: var(--hot, #ffd23f); }
.tb-find::placeholder { color: var(--ink-soft, #9aa7c0); }
.tb-list { overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.tb-group { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tb-group > b { flex: 0 0 74px; font: 600 9.5px/1 var(--mono, monospace); letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft, #9aa7c0); }
.tb-act { display: inline-flex; align-items: center; gap: 9px; padding: 8px 11px; border-radius: 9px; border: 1px solid var(--rule, rgb(255 255 255 / .15)); background: none; color: inherit; font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.tb-act kbd { font: 400 10.5px/1 var(--mono, monospace); color: var(--ink-soft, #9aa7c0); }
.tb-act:hover { border-color: currentColor; }
.tb-act.on { background: var(--hot, #ffd23f); border-color: var(--hot, #ffd23f); color: var(--hot-ink, #1b1500); }
.tb-act.on kbd { color: inherit; opacity: .7; }
.tb-none { color: var(--ink-soft, #9aa7c0); padding: 6px 2px; }
.tb-foot { font: 400 10.5px/1.4 var(--mono, monospace); color: var(--ink-soft, #9aa7c0); }
.tb-toast { position: fixed; left: 50%; bottom: 22px; z-index: 39; translate: -50% 0; max-width: calc(100vw - 32px); padding: 10px 16px; border-radius: 99px; background: var(--card, var(--paper, #0e1422)); color: var(--ink, #eef2fa); border: 1px solid var(--rule, rgb(255 255 255 / .15)); font: 500 13.5px/1.3 var(--body, system-ui, sans-serif); box-shadow: 0 10px 30px rgb(0 0 0 / .35); opacity: 0; pointer-events: none; transition: opacity .2s, translate .2s; }
.tb-toast.show { opacity: 1; }
.tb-toast.bad { border-color: #ff8a6b; }
@media (max-width: 899px) { .tb { bottom: 10px; } .tb-group > b { flex-basis: 100%; } .tb-act kbd, .tb-foot { display: none; } }
@media (prefers-reduced-motion: reduce) { .tb, .tb-toast { transition: none; } }
`;

export function createToolbar({ actions, placeholder = 'Type to find something', onFilter = () => {} }) {
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const el = Object.assign(document.createElement('div'), { className: 'tb', hidden: true });
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Toolbar');
  el.innerHTML = `<input class="tb-find" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Find an action"><div class="tb-list"></div><p class="tb-foot">arrow keys to move · enter to run · esc or ctrl + space to close</p>`;
  const find = el.querySelector('.tb-find'), list = el.querySelector('.tb-list');
  find.placeholder = placeholder;
  const toastEl = Object.assign(document.createElement('p'), { className: 'tb-toast' });
  toastEl.setAttribute('role', 'status');
  document.body.append(el, toastEl);
  let all = [], shown = [], active = 0, timer = 0, back = null;

  function draw() {
    const q = find.value.trim().toLowerCase();
    shown = all.filter(a => !q || `${a.label} ${a.group} ${a.find || ''}`.toLowerCase().includes(q));
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    if (!shown.length) list.innerHTML = `<p class="tb-none">Nothing here matches “${find.value.trim().replace(/[&<>]/g, '')}”.</p>`;
    let row = null, group = null;
    shown.forEach((a, n) => {
      if (a.group !== group) { group = a.group; row = Object.assign(document.createElement('div'), { className: 'tb-group' }); row.append(Object.assign(document.createElement('b'), { textContent: group })); list.append(row); }
      const b = Object.assign(document.createElement('button'), { className: 'tb-act' + (n === active ? ' on' : ''), type: 'button', tabIndex: -1 });
      b.append(a.label); if (a.keys) b.append(Object.assign(document.createElement('kbd'), { textContent: a.keys }));
      b.addEventListener('click', () => go(a));
      row.append(b);
    });
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  function go(a) { close(); a.run(); }
  function open() {
    if (!el.hidden) return;
    back = document.activeElement;
    all = actions(); find.value = ''; active = 0; draw();
    el.hidden = false; toastEl.classList.remove('show');
    find.focus();
  }
  function close() {
    if (el.hidden) return;
    el.hidden = true; onFilter('');
    if (back?.isConnected) back.focus({ preventScroll: true }); else find.blur();
  }
  find.addEventListener('input', () => { active = 0; draw(); onFilter(find.value); });
  find.addEventListener('keydown', e => {
    if (e.ctrlKey && e.code === 'Space') return;                      // the global handler closes it
    e.stopPropagation();                                              // typing here is not a page shortcut
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) go(shown[active]); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab') { e.preventDefault(); const d = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1; active = (active + d + shown.length) % Math.max(1, shown.length); draw(); }
  });
  addEventListener('keydown', e => { if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); el.hidden ? open() : close(); } }, true);
  addEventListener('pointerdown', e => { if (!el.hidden && !el.contains(e.target) && !e.target.closest('[data-toolbar]')) close(); });

  return {
    open, close,
    toggle: () => (el.hidden ? open() : close()),
    get isOpen() { return !el.hidden; },
    // A short message that fades on its own.
    toast(text, bad = false) {
      clearTimeout(timer);
      if (!text) return toastEl.classList.remove('show');
      toastEl.textContent = text; toastEl.classList.toggle('bad', bad); toastEl.classList.add('show');
      timer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    },
  };
}

// On an upright phone, a short nudge that the 3D scenes have more room sideways. Shown once per page per visit; a tap dismisses it.
export function rotateHint() {
  const upright = matchMedia('(max-width: 899px) and (orientation: portrait)');
  const key = 'rotate-hint:' + location.pathname;      // once per page, so the kit room and the stadium each get theirs
  try { if (!upright.matches || sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { if (!upright.matches) return; }
  const el = document.createElement('button');
  el.className = 'rotate-hint'; el.setAttribute('aria-label', 'Rotate your phone for the best view. Dismiss.');
  el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 9a8 8 0 0 0-3-5M4 15a8 8 0 0 0 3 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Rotate your phone for the best view</span>';
  const css = document.createElement('style');
  css.textContent = '.rotate-hint { position: fixed; left: 50%; top: calc(104px + env(safe-area-inset-top)); z-index: 30; translate: -50% 0; display: flex; align-items: center; gap: 8px; white-space: nowrap; padding: 9px 15px 9px 11px; border: 1px solid var(--rule, rgb(255 255 255 / .2)); border-radius: 99px; background: rgb(8 12 22 / .9); color: #fff; font: 600 13px/1 var(--body, system-ui, sans-serif); box-shadow: 0 8px 24px rgb(0 0 0 / .4); cursor: pointer; transition: opacity .4s, translate .4s; } .rotate-hint svg { width: 20px; height: 20px; } .rotate-hint.gone { opacity: 0; translate: -50% -8px; pointer-events: none; }';
  document.head.append(css); document.body.append(el);
  const go = () => { el.classList.add('gone'); setTimeout(() => el.remove(), 500); upright.removeEventListener('change', go); };
  el.onclick = go; upright.addEventListener('change', go); setTimeout(go, 8000);
}
