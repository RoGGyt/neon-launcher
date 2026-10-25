// Мини-хелперы для DOM без фреймворков
import type { LauncherApi } from '../shared/types';

declare global {
  interface Window { launcher: LauncherApi }
}

export const api = window.launcher;

type Attrs = Record<string, string | number | boolean | null | undefined | ((e: any) => void)>;
type Child = Node | string | number | null | undefined | false;

/** h('div.card#id', { onclick }, ...children) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | string, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElement {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const part of rest) {
    if (part.startsWith('.')) el.classList.add(part.slice(1));
    else if (part.startsWith('#')) el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`Нет элемента ${sel}`);
  return el as HTMLElement;
}

export function clear(el: HTMLElement) {
  el.replaceChildren();
}

export function icon(name: keyof typeof ICONS, size = 18): SVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return wrap.firstElementChild as SVGElement;
}

export const ICONS = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  layers: '<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 13 10 5 10-5"/>',
  puzzle: '<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  terminal: '<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  download: '<path d="M12 3v12m0 0-5-5m5 5 5-5"/><path d="M4 19h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  min: '<path d="M5 12h14"/>',
  max: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cube: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
};

// ---------- тосты ----------

export function toast(text: string, kind: 'ok' | 'error' | 'info' = 'info', ms = 4200) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div#toasts');
    document.body.append(box);
  }
  const t = h(`div.toast.${kind}`, {}, h('span.toast-dot'), h('span', {}, text));
  box.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

/** Выполнить действие и показать ошибку тостом */
export async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    toast((e as Error).message, 'error', 6000);
    return undefined;
  }
}

// ---------- модальное окно ----------

export function modal(title: string, body: HTMLElement, actions: HTMLElement[]): { close: () => void } {
  const backdrop = h('div.modal-backdrop');
  const close = () => {
    backdrop.classList.remove('show');
    setTimeout(() => backdrop.remove(), 200);
  };
  const box = h('div.modal', {},
    h('div.modal-head', {}, h('h2', {}, title), h('button.icon-btn', { onclick: close, title: 'Закрыть' }, icon('x'))),
    h('div.modal-body', {}, body),
    h('div.modal-actions', {}, ...actions),
  );
  backdrop.append(box);
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));
  return { close };
}

export function confirmDialog(title: string, text: string, okText = 'Да'): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); m.close(); } };
    const m = modal(title, h('p.muted', {}, text), [
      h('button.btn.ghost', { onclick: () => finish(false) }, 'Отмена'),
      h('button.btn.danger', { onclick: () => finish(true) }, okText),
    ]);
  });
}

// ---------- форматирование ----------

export function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.0', '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.0', '')}K`;
  return String(n);
}

export function fmtSize(b: number): string {
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(b / 1024))} КБ`;
}

export function fmtAgo(ts?: number): string {
  if (!ts) return 'ещё не запускался';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const hh = Math.floor(m / 60);
  if (hh < 24) return `${hh} ч назад`;
  const d = Math.floor(hh / 24);
  return d === 1 ? 'вчера' : `${d} дн назад`;
}

export function loaderLabel(l: string): string {
  return l === 'fabric' ? 'Fabric' : l === 'forge' ? 'Forge' : 'Vanilla';
}
