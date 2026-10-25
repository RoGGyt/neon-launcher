// Neon Client — интерфейс Neon в игре. Подгружается при запуске через fabric.addMods,
// поэтому его нет в папке mods. Ванильные профили на поддерживаемых версиях тихо запускаются через Fabric.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { paths } from './paths';
import { resourceFile } from './resources';
import { getSettings } from './store';
import { listFabric, installFabric } from './loaders';
import { downloadFile, fetchJson, needsDownload } from './net';
import type { Profile } from '../shared/types';

/** Версии Minecraft, под которые собран клиент */
export const NEON_CLIENT_JARS: Record<string, string> = {
  '1.20.1': 'neonclient-mc1201.jar',
  '1.21.11': 'neonclient-mc12111.jar',
};

export function neonMenuSupported(mc: string): boolean {
  return mc in NEON_CLIENT_JARS;
}

/** Путь к jar клиента, если интерфейс Neon включён и подходит для профиля */
export function neonMenuJar(p: Profile): string | null {
  if (getSettings().neonMenu === false) return null;
  if (p.loader === 'forge') return null;
  const name = NEON_CLIENT_JARS[p.mcVersion];
  return name ? resourceFile(name) : null;
}

/** Fabric для ванильного профиля: свежий стабильный лоадер, без сети — уже установленный */
export async function hiddenFabric(mc: string, log: (s: string) => void): Promise<string> {
  try {
    const loaders = await listFabric(mc);
    const pick = loaders.find(l => l.stable) ?? loaders[0];
    if (pick) {
      const id = `fabric-loader-${pick.id}-${mc}`;
      if (fs.existsSync(paths.versionJson(id))) return id;
      log(`Готовлю интерфейс Neon (Fabric ${pick.id})…`);
      return await installFabric(mc, pick.id);
    }
  } catch { /* нет сети — берём локальный */ }
  try {
    const ids = (await fsp.readdir(paths.versions)).filter(d => d.startsWith('fabric-loader-') && d.endsWith(`-${mc}`) && fs.existsSync(paths.versionJson(d)));
    if (ids.length) return ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse()[0];
  } catch { /* папки ещё нет */ }
  throw new Error(`Нет Fabric для ${mc} — выключи «Интерфейс Neon» в настройках`);
}

interface ModrinthVersion {
  version_type: string;
  files: { url: string; filename: string; primary: boolean; hashes: { sha1: string }; size: number }[];
}

/** Есть ли Fabric API в папке mods профиля (тогда второй не подключаем — иначе игра не запустится) */
function profileHasFabricApi(p: Profile): boolean {
  const dir = path.join(paths.profileDir(p.id), 'mods');
  try {
    if (fs.readdirSync(dir).some(f => /fabric-api/i.test(f) && f.endsWith('.jar'))) return true;
    const meta = JSON.parse(fs.readFileSync(path.join(paths.profileDir(p.id), 'neon-mods.json'), 'utf8')) as Record<string, { projectId: string }>;
    return Object.entries(meta).some(([file, m]) => m.projectId === 'P7dR8mSH' && fs.existsSync(path.join(dir, file)));
  } catch {
    return false;
  }
}

/**
 * Fabric API нужен клиенту Neon для загрузки его текстур и шрифта.
 * Если в профиле его нет — скачиваем в кэш лаунчера и подключаем незаметно.
 */
export async function hiddenFabricApi(p: Profile, log: (s: string) => void): Promise<string | null> {
  if (profileHasFabricApi(p)) return null;
  const dir = path.join(paths.cache, 'fabric-api', p.mcVersion);
  const cached = () => {
    try {
      const f = fs.readdirSync(dir).filter(x => x.endsWith('.jar')).sort().reverse()[0];
      return f ? path.join(dir, f) : null;
    } catch {
      return null;
    }
  };
  try {
    const q = new URLSearchParams({ loaders: '["fabric"]', game_versions: JSON.stringify([p.mcVersion]) });
    const list = await fetchJson<ModrinthVersion[]>(`https://api.modrinth.com/v2/project/fabric-api/version?${q}`);
    const ver = list.find(v => v.version_type === 'release') ?? list[0];
    const file = ver?.files.find(f => f.primary) ?? ver?.files[0];
    if (!file) return cached();
    const dest = path.join(dir, file.filename);
    const task = { url: file.url, dest, sha1: file.hashes.sha1, size: file.size };
    if (await needsDownload(task)) {
      log('Скачиваю Fabric API для интерфейса Neon…');
      await downloadFile(task);
      for (const old of fs.readdirSync(dir)) if (old !== file.filename) await fsp.rm(path.join(dir, old), { force: true });
    }
    return dest;
  } catch {
    return cached();
  }
}
