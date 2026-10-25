// Автообновление лаунчера через GitHub Releases (electron-updater)
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';

export const RELEASES_URL = 'https://github.com/RoGGyt/neon-launcher/releases/latest';
const CHECK_EVERY_MS = 2 * 3600_000;

/** Портативный exe нельзя обновить на месте — только скачать новый */
export const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

let state: UpdateState = { status: 'idle' };
let notify: (s: UpdateState) => void = () => undefined;
let log: (line: string) => void = () => undefined;

function set(s: UpdateState) {
  state = s;
  notify(state);
}

export function getUpdateState(): UpdateState {
  return state;
}

export function initUpdater(onChange: (s: UpdateState) => void, onLog: (line: string) => void) {
  notify = onChange;
  log = onLog;
  if (!app.isPackaged) return; // при npm start обновляться нечему

  autoUpdater.autoDownload = !isPortable;
  autoUpdater.autoInstallOnAppQuit = !isPortable;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    if (state.status === 'idle' || state.status === 'error') set({ status: 'checking' });
  });
  autoUpdater.on('update-not-available', () => set({ status: 'idle' }));
  autoUpdater.on('update-available', info => {
    log(`Доступна новая версия лаунчера: ${info.version}`);
    set(isPortable ? { status: 'manual', version: info.version } : { status: 'downloading', version: info.version, percent: 0 });
  });
  autoUpdater.on('download-progress', p => {
    set({ status: 'downloading', version: state.version, percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', info => {
    log(`Обновление ${info.version} скачано, установится при перезапуске`);
    set({ status: 'ready', version: info.version });
  });
  autoUpdater.on('error', err => {
    log(`Автообновление: ${err?.message ?? err}`);
    // не затираем уже скачанное обновление ошибкой повторной проверки
    if (state.status !== 'ready') set({ status: 'error', error: err?.message ?? String(err) });
  });

  checkForUpdates();
  setInterval(checkForUpdates, CHECK_EVERY_MS);
}

export function checkForUpdates() {
  if (!app.isPackaged || state.status === 'downloading' || state.status === 'ready') return;
  autoUpdater.checkForUpdates().catch(() => undefined);
}

export function installUpdate() {
  if (state.status !== 'ready') throw new Error('Обновление ещё не скачано');
  // тихая установка и автоматический перезапуск лаунчера
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}
