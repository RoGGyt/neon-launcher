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
import { initUpdater, getUpdateState, checkForUpdates, installUpdate, isPortable, RELEASES_URL } from './updater';
import type { ContentKind, Loader, LogEvent, ProgressEvent } from '../shared/types';

let win: BrowserWindow | null = null;

function send(channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
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
    if (isRunning().running) {
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
    try {
      await launchProfile(
        profile,
        hooks,
        () => {
          send('launch-state', isRunning());
          const after = store.getSettings().afterLaunch;
          if (after === 'hide') win?.hide();
          if (after === 'close') setTimeout(() => app.exit(0), 300);
        },
        () => {
          send('launch-state', isRunning());
          if (win && !win.isVisible()) win.show();
        },
      );
    } finally {
      hooks.progress(null);
    }
  });
  handle('game:kill', () => killGame());
  handle('game:state', () => isRunning());

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
    await fsp.mkdir(paths.root, { recursive: true });
    registerIpc();
    createWindow();
    initUpdater(st => send('update', st), line => hooks.log(line));
  });

  app.on('window-all-closed', () => {
    // если игра запущена и окно просто спрятано — не выходим
    if (!isRunning().running) app.quit();
  });
}
