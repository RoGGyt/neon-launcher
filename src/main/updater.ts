// Автообновление лаунчера через GitHub Releases (electron-updater)
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';

export const RELEASES_URL = 'https://github.com/RoGGyt/neon-launcher/releases/latest';
/** latest.yml и установщик всегда берём из самого свежего релиза (GitHub сам перенаправляет) */
const FEED_URL = 'https://github.com/RoGGyt/neon-launcher/releases/latest/download';
const CHECK_EVERY_MS = 2 * 3600_000;

/** Портативный exe нельзя обновить на месте — только скачать новый */
export const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

let state: UpdateState = { status: 'idle' };
let notify: (s: UpdateState) => void = () => undefined;
let log: (line: string) => void = () => undefined;
/** пользователь нажал «Перезапустить» — ставим, как только докачается самая свежая версия */
let installWhenReady = false;

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
  autoUpdater.setFeedURL({ provider: 'generic', url: FEED_URL });

  autoUpdater.on('checking-for-update', () => {
    if (state.status === 'idle' || state.status === 'error') set({ status: 'checking' });
  });
  autoUpdater.on('update-not-available', () => {
    if (state.status !== 'ready') set({ status: 'idle' });
  });
  autoUpdater.on('update-available', info => {
    // эта версия уже скачана — ничего не меняем, update-downloaded придёт из кэша
    if (state.status === 'ready' && state.version === info.version) return;
    log(`Доступна новая версия лаунчера: ${info.version}`);
    set(isPortable ? { status: 'manual', version: info.version } : { status: 'downloading', version: info.version, percent: 0 });
  });
  autoUpdater.on('download-progress', p => {
    set({ status: 'downloading', version: state.version, percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', info => {
    log(`Обновление ${info.version} скачано, установится при перезапуске`);
    set({ status: 'ready', version: info.version });
    if (installWhenReady) setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
  autoUpdater.on('error', err => {
    log(`Автообновление: ${err?.message ?? err}`);
    // не затираем уже скачанное обновление ошибкой повторной проверки
    if (state.status !== 'ready') set({ status: 'error', error: err?.message ?? String(err) });
  });

  checkForUpdates();
  setInterval(checkForUpdates, CHECK_EVERY_MS);
}

/** Проверка всегда ищет самую свежую версию, даже если какое-то обновление уже скачано */
export function checkForUpdates() {
  if (!app.isPackaged || state.status === 'downloading' || state.status === 'checking') return;
  autoUpdater.checkForUpdates().catch(() => undefined);
}

export async function installUpdate() {
  if (state.status !== 'ready') throw new Error('Обновление ещё не скачано');
  // перед установкой ещё раз смотрим, не вышло ли что-то новее скачанного
  installWhenReady = true;
  const ready = state.version;
  const result = await Promise.race([
    autoUpdater.checkForUpdates().catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), 8000)),
  ]);
  const latest = result?.updateInfo?.version;
  if (!latest || latest === ready) {
    // новее нет (или нет сети) — ставим то, что уже скачано
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }
  // иначе качается более новая версия — поставится сама в update-downloaded
}
