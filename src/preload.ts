// Мост между интерфейсом и main-процессом. Окно получает только этот набор функций.
import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherApi } from './shared/types';

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value as T;
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: LauncherApi = {
  getSystemInfo: () => call('system:info'),
  getSettings: () => call('settings:get'),
  saveSettings: patch => call('settings:save', patch),

  listVersions: force => call('versions:list', force),
  listLoaderVersions: (loader, mc) => call('loaders:list', loader, mc),

  listProfiles: () => call('profiles:list'),
  saveProfile: p => call('profiles:save', p),
  deleteProfile: (id, deleteFiles) => call('profiles:delete', id, deleteFiles),
  openProfileFolder: id => call('profiles:open', id),
  openRootFolder: () => call('root:open'),

  loginOffline: name => call('auth:offline', name),
  loginEly: (login, password, totp) => call('auth:ely', login, password, totp),
  logout: () => call('auth:logout'),

  launch: profileId => call('game:launch', profileId),
  killGame: () => call('game:kill'),
  getLaunchState: () => call('game:state'),

  searchMods: (profileId, query, offset) => call('mods:search', profileId, query, offset),
  installMod: (profileId, projectId) => call('mods:install', profileId, projectId),
  listMods: profileId => call('mods:list', profileId),
  toggleMod: (profileId, file) => call('mods:toggle', profileId, file),
  deleteMod: (profileId, file) => call('mods:delete', profileId, file),
  openModsFolder: profileId => call('mods:open', profileId),

  windowControl: action => ipcRenderer.send('window', action),

  onProgress: cb => subscribe('progress', cb),
  onLog: cb => subscribe('log', cb),
  onLaunchState: cb => subscribe('launch-state', cb),
};

contextBridge.exposeInMainWorld('launcher', api);
