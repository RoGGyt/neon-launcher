import { app, BrowserWindow, ipcMain, shell } from 'electron';
import os from 'os';
import fsp from 'fs/promises';
import path from 'path';
import { initRoot, paths } from './paths';
import * as store from './store';
import { listVersions } from './mojang';
import { listFabric, listForge } from './loaders';
import { offlineAccount, elyLogin, elyLogout } from './auth';
import { launchProfile, killGame, isRunning } from './launch';
import * as mods from './mods';
import { exportProfileCode, importProfileCode } from './share';
import { playCloud, stopCloud, cloudActive, cloudBusy, localWorlds, uploadNewCloudWorld, readSession } from './cloudplay';
import { setResourcesDir } from './resources';
import { yandexAuthUrl, parseAuthRedirect, YaDisk, YANDEX_CLIENT_ID } from './yadisk';
import { initUpdater, getUpdateState, checkForUpdates, installUpdate, isPortable, RELEASES_URL } from './updater';
import type { ContentKind, Loader, LogEvent, ProgressEvent } from '../shared/types';

let win: BrowserWindow | null = null;

function send(channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** состояние для интерфейса: игра идёт или облачная сессия ещё работает */
function launchState() {
  return { ...isRunning(), cloud: cloudActive() };
}

const hooks = {
  progress: (e: ProgressEvent | null) => send('progress', e),
  log: (line: string, level: LogEvent['level'] = 'info') => send('log', { line, level }),
};

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 700,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    backgroundColor: '#07070d',
    title: 'Neon Launcher',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));

  // внешние ссылки открываем в браузере, а не в лаунчере
  win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e: { preventDefault(): void }) => e.preventDefault());

  // пока игра запущена, крестик прячет лаунчер, чтобы он вернулся после выхода из игры
  win.on('close', (e: { preventDefault(): void }) => {
    if (isRunning().running || cloudActive() || cloudBusy()) {
      e.preventDefault();
      win?.hide();
    }
  });
}

/** Обёртка: ошибки из main уходят в интерфейс понятным текстом */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...(args as A)) };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      hooks.log(msg, 'error');
      return { ok: false, error: msg };
    }
  });
}

function registerIpc() {
  handle('system:info', () => ({
    appVersion: app.getVersion(),
    portable: isPortable,
    totalMemMb: Math.floor(os.totalmem() / 1024 / 1024),
    platform: process.platform,
    rootDir: paths.root,
  }));

  handle('settings:get', () => store.getSettings());
  handle('settings:save', (patch: Parameters<typeof store.saveSettings>[0]) => store.saveSettings(patch));

  handle('versions:list', (force?: boolean) => listVersions(force));
  handle('loaders:list', (loader: Loader, mc: string) => {
    if (loader === 'fabric') return listFabric(mc);
    if (loader === 'forge') return listForge(mc);
    return [];
  });

  handle('profiles:list', () => store.listProfiles());
  handle('profiles:save', async (p: Parameters<typeof store.saveProfile>[0]) => {
    const saved = await store.saveProfile(p);
    if (!store.getSettings().selectedProfileId) await store.saveSettings({ selectedProfileId: saved.id });
    return saved;
  });
  handle('profiles:delete', (id: string, deleteFiles: boolean) => {
    if (isRunning().profileId === id) throw new Error('Сначала закрой игру этого профиля');
    return store.deleteProfile(id, deleteFiles);
  });
  handle('profiles:open', async (id: string) => {
    const dir = paths.profileDir(id);
    await fsp.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });
  handle('root:open', async () => {
    await fsp.mkdir(paths.root, { recursive: true });
    await shell.openPath(paths.root);
  });

  handle('auth:offline', async (name: string) => {
    const acc = offlineAccount(name.trim());
    await store.saveSettings({ account: acc, nickname: acc.name });
    return acc;
  });
  handle('auth:ely', async (login: string, password: string, totp?: string) => {
    const acc = await elyLogin(login.trim(), password, totp?.trim() || undefined);
    await store.saveSettings({ account: acc, nickname: acc.name });
    return acc;
  });
  handle('auth:logout', async () => {
    const acc = store.getSettings().account;
    if (acc?.type === 'ely') await elyLogout(acc);
    const nick = store.getSettings().nickname;
    await store.saveSettings({ account: nick ? offlineAccount(nick) : null });
  });

  handle('game:launch', async (profileId: string) => {
    const profile = store.getProfile(profileId);
    await store.saveSettings({ selectedProfileId: profileId });
    if (profile.cloud) {
      await playCloud(profileId, hooks, {
        status: text => send('cloud-status', text),
        onGameStart: () => {
          send('launch-state', launchState());
          if (store.getSettings().afterLaunch !== 'keep') win?.hide();
        },
        onDone: error => {
          send('launch-state', launchState());
          send('cloud-status', null);
          if (error) send('cloud-error', error);
          if (win && !win.isVisible()) win.show();
        },
      });
      send('launch-state', launchState());
      return;
    }
    try {
      await launchProfile(
        profile,
        hooks,
        () => {
          send('launch-state', launchState());
          const after = store.getSettings().afterLaunch;
          if (after === 'hide') win?.hide();
          if (after === 'close') setTimeout(() => app.exit(0), 300);
        },
        () => {
          send('launch-state', launchState());
          if (win && !win.isVisible()) win.show();
        },
      );
    } finally {
      hooks.progress(null);
    }
  });
  handle('game:kill', () => {
    stopCloud();
    killGame();
  });
  handle('game:state', () => launchState());

  // ---------- облачные миры ----------
  handle('cloud:available', () => Boolean(YANDEX_CLIENT_ID));
  handle('cloud:login', () => yandexLogin());
  handle('cloud:logout', () => store.saveSettings({ yandex: null }));
  handle('cloud:worlds', (id: string) => localWorlds(store.getProfile(id)));
  handle('cloud:create', async (id: string, folder: string) => {
    const s = store.getSettings();
    if (!s.yandex?.token) throw new Error('Сначала войди в Яндекс');
    if (!s.account) throw new Error('Сначала введи ник');
    try {
      return await uploadNewCloudWorld(store.getProfile(id), s.yandex.token, folder, s.account.name, hooks);
    } finally {
      hooks.progress(null);
    }
  });
  handle('cloud:detach', async (id: string) => {
    if (cloudActive()) throw new Error('Сначала закрой игру');
    await store.updateProfile(id, { cloud: undefined, cloudBaseVersion: undefined, cloudPendingUpload: undefined });
  });
  handle('cloud:who', async (id: string) => {
    const c = store.getProfile(id).cloud;
    if (!c) return null;
    const s = await readSession(new YaDisk(c.token), c.worldId);
    return s && Date.now() - s.beat < 60_000 ? { host: s.host, state: s.state } : null;
  });

  const K = (k: ContentKind): ContentKind => (k === 'shader' ? 'shader' : 'mod');
  handle('content:search', (id: string, k: ContentKind, q: string, offset: number) => mods.searchContent(store.getProfile(id), K(k), q, offset));
  handle('content:install', (id: string, k: ContentKind, projectId: string) => mods.installContent(store.getProfile(id), K(k), projectId));
  handle('content:list', (id: string, k: ContentKind) => mods.listContent(store.getProfile(id), K(k)));
  handle('content:toggle', (id: string, k: ContentKind, file: string) => mods.toggleContent(store.getProfile(id), K(k), file));
  handle('content:delete', (id: string, k: ContentKind, file: string) => mods.deleteContent(store.getProfile(id), K(k), file));
  handle('content:open', async (id: string, k: ContentKind) => {
    const dir = mods.contentFolder(store.getProfile(id), K(k));
    await fsp.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });

  handle('share:export', (id: string) => exportProfileCode(store.getProfile(id)));
  handle('share:import', async (code: string) => {
    try {
      return await importProfileCode(code, (done, total, label) =>
        hooks.progress({ stage: `${label} (${done}/${total})`, done, total }));
    } finally {
      hooks.progress(null);
    }
  });

  handle('update:state', () => getUpdateState());
  handle('update:check', () => checkForUpdates());
  handle('update:install', () => {
    if (isRunning().running) throw new Error('Сначала закрой игру — лаунчер перезапустится для обновления');
    installUpdate();
  });
  handle('update:releases', () => shell.openExternal(RELEASES_URL));

  ipcMain.on('window', (_e, action: string) => {
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
  });
}

/** Окно входа в Яндекс: ловим редирект с токеном (OAuth implicit flow) */
function yandexLogin(): Promise<{ ok: true }> {
  return new Promise((resolve, reject) => {
    const url = yandexAuthUrl();
    const auth = new BrowserWindow({
      width: 520, height: 720, parent: win ?? undefined, modal: true,
      title: 'Вход в Яндекс', backgroundColor: '#ffffff', autoHideMenuBar: true,
      webPreferences: { partition: 'persist:yandex', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    let finished = false;
    const check = async (target: string) => {
      const r = parseAuthRedirect(target);
      if (!r || finished) return;
      finished = true;
      auth.close();
      if ('error' in r) return reject(new Error(r.error));
      await store.saveSettings({ yandex: { token: r.token, expiresAt: r.expiresAt } });
      resolve({ ok: true });
    };
    auth.webContents.on('will-redirect', (_e: unknown, u: string) => { check(u); });
    auth.webContents.on('will-navigate', (_e: unknown, u: string) => { check(u); });
    auth.webContents.on('did-navigate', (_e: unknown, u: string) => { check(u); });
    auth.webContents.on('did-navigate-in-page', (_e: unknown, u: string) => { check(u); });
    auth.webContents.on('did-finish-load', () => { check(auth.webContents.getURL()); });
    auth.webContents.setWindowOpenHandler(({ url: u }: { url: string }) => {
      if (/^https:\/\//.test(u)) shell.openExternal(u);
      return { action: 'deny' };
    });
    auth.on('closed', () => { if (!finished) reject(new Error('Вход в Яндекс отменён')); });
    auth.loadURL(url);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (!win.isVisible()) win.show();
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    initRoot(app.getPath('appData'));
    setResourcesDir(app.isPackaged ? (process as NodeJS.Process & { resourcesPath: string }).resourcesPath : path.join(__dirname, '..', '..', 'resources'));
    await fsp.mkdir(paths.root, { recursive: true });
    registerIpc();
    createWindow();
    initUpdater(st => send('update', st), line => hooks.log(line));
  });

  app.on('window-all-closed', () => {
    // если игра запущена и окно просто спрятано — не выходим
    if (!isRunning().running && !cloudActive()) app.quit();
  });
}
