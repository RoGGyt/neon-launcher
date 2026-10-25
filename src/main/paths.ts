import path from 'path';
import os from 'os';

let root = '';

/** Корневая папка лаунчера: %APPDATA%/.neonlauncher (Windows), ~/.neonlauncher (Linux/macOS) */
export function initRoot(appDataDir: string): string {
  root = process.platform === 'win32'
    ? path.join(appDataDir, '.neonlauncher')
    : path.join(os.homedir(), '.neonlauncher');
  return root;
}

export const paths = {
  get root() { return root; },
  get versions() { return path.join(root, 'versions'); },
  get libraries() { return path.join(root, 'libraries'); },
  get assets() { return path.join(root, 'assets'); },
  get runtime() { return path.join(root, 'runtime'); },
  get profiles() { return path.join(root, 'profiles'); },
  get cache() { return path.join(root, 'cache'); },
  get settingsFile() { return path.join(root, 'settings.json'); },
  get profilesFile() { return path.join(root, 'profiles.json'); },
  versionDir(id: string) { return path.join(root, 'versions', id); },
  versionJson(id: string) { return path.join(root, 'versions', id, `${id}.json`); },
  versionJar(id: string) { return path.join(root, 'versions', id, `${id}.jar`); },
  nativesDir(id: string) { return path.join(root, 'versions', id, 'natives'); },
  profileDir(profileId: string) { return path.join(root, 'profiles', profileId); },
};

export type OsName = 'windows' | 'osx' | 'linux';

export function osName(): OsName {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'osx';
  return 'linux';
}

/** Безопасное имя файла/папки (защита от ../ в данных из сети) */
export function safeJoin(base: string, rel: string): string {
  const full = path.resolve(base, rel);
  const baseResolved = path.resolve(base);
  if (full !== baseResolved && !full.startsWith(baseResolved + path.sep)) {
    throw new Error(`Небезопасный путь: ${rel}`);
  }
  return full;
}
