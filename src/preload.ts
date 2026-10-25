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

  searchContent: (profileId, kind, query, offset) => call('content:search', profileId, kind, query, offset),
  installContent: (profileId, kind, projectId) => call('content:install', profileId, kind, projectId),
  listContent: (profileId, kind) => call('content:list', profileId, kind),
  toggleContent: (profileId, kind, file) => call('content:toggle', profileId, kind, file),
  deleteContent: (profileId, kind, file) => call('content:delete', profileId, kind, file),
  openContentFolder: (profileId, kind) => call('content:open', profileId, kind),

  cloudAvailable: () => call('cloud:available'),
  cloudLogin: () => call('cloud:login'),
  cloudLogout: () => call('cloud:logout'),
  cloudWorlds: profileId => call('cloud:worlds', profileId),
  cloudCreate: (profileId, folder) => call('cloud:create', profileId, folder),
  cloudDetach: profileId => call('cloud:detach', profileId),
  cloudWho: profileId => call('cloud:who', profileId),
  onCloudStatus: cb => subscribe('cloud-status', cb),
  onCloudError: cb => subscribe('cloud-error', cb),

  exportProfileCode: profileId => call('share:export', profileId),
  importProfileCode: code => call('share:import', code),

  getUpdateState: () => call('update:state'),
  checkForUpdates: () => call('update:check'),
  installUpdate: () => call('update:install'),
  openReleases: () => call('update:releases'),

  windowControl: action => ipcRenderer.send('window', action),

  onProgress: cb => subscribe('progress', cb),
  onLog: cb => subscribe('log', cb),
  onLaunchState: cb => subscribe('launch-state', cb),
  onUpdate: cb => subscribe('update', cb),
};

contextBridge.exposeInMainWorld('launcher', api);
