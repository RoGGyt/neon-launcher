// Neon Client — своё главное меню в игре. Подгружается при запуске через fabric.addMods,
// поэтому его нет в папке mods. Ванильные профили на поддерживаемых версиях тихо запускаются через Fabric.
import fs from 'fs';
import fsp from 'fs/promises';
import { paths } from './paths';
import { resourceFile } from './resources';
import { getSettings } from './store';
import { listFabric, installFabric } from './loaders';
import type { Profile } from '../shared/types';

/** Версии Minecraft, под которые собран клиент */
export const NEON_CLIENT_JARS: Record<string, string> = {
  '1.20.1': 'neonclient-mc1201.jar',
  '1.21.11': 'neonclient-mc12111.jar',
};

export function neonMenuSupported(mc: string): boolean {
  return mc in NEON_CLIENT_JARS;
}

/** Путь к jar клиента, если меню включено и подходит для профиля */
export function neonMenuJar(p: Profile): string | null {
  if (getSettings().neonMenu === false) return null;
  if (p.loader === 'forge') return null;
  const name = NEON_CLIENT_JARS[p.mcVersion];
  return name ? resourceFile(name) : null;
}

/** Fabric для ванильного профиля: берём уже установленный, иначе ставим свежий стабильный */
export async function hiddenFabric(mc: string, log: (s: string) => void): Promise<string> {
  try {
    const ids = (await fsp.readdir(paths.versions)).filter(d => d.startsWith('fabric-loader-') && d.endsWith(`-${mc}`) && fs.existsSync(paths.versionJson(d)));
    if (ids.length) return ids.sort().reverse()[0];
  } catch { /* папки ещё нет */ }
  const loaders = await listFabric(mc);
  const pick = loaders.find(l => l.stable) ?? loaders[0];
  if (!pick) throw new Error(`Нет Fabric для ${mc} — выключи «Меню Neon» в настройках`);
  log(`Готовлю меню Neon (Fabric ${pick.id})…`);
  return installFabric(mc, pick.id);
}
