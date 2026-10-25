// Код сборки: друг вставляет его и получает такой же профиль (версия, лоадер, моды, шейдеры, сервер)
import zlib from 'zlib';
import { saveProfile } from './store';
import { exportContent, installContent, activateShaderByProject } from './mods';
import type { Loader, Profile } from '../shared/types';

const PREFIX = 'NEON1-';

interface ShareData {
  n: string;            // название
  v: string;            // версия Minecraft
  l: Loader;            // модлоадер
  lv?: string;          // версия модлоадера
  s?: string;           // адрес сервера
  sn?: string;          // название сервера
  j?: 1;                // автовход на сервер
  m?: [string, string?][];  // моды: [projectId, versionId]
  sh?: [string, string?][]; // шейдеры
  as?: string;          // активный шейдер (projectId)
  r?: number;           // RAM, МБ
}

export async function exportProfileCode(p: Profile): Promise<{ code: string; skipped: number }> {
  const data: ShareData = { n: p.name, v: p.mcVersion, l: p.loader, r: p.ramMb };
  if (p.loaderVersion) data.lv = p.loaderVersion;
  if (p.serverAddress) data.s = p.serverAddress;
  if (p.serverName) data.sn = p.serverName;
  if (p.autoJoin) data.j = 1;
  let skipped = 0;
  if (p.loader !== 'vanilla') {
    const mods = await exportContent(p, 'mod');
    const shaders = await exportContent(p, 'shader');
    if (mods.list.length) data.m = mods.list;
    if (shaders.list.length) data.sh = shaders.list;
    if (shaders.activeShader) data.as = shaders.activeShader;
    skipped = mods.skipped + shaders.skipped;
  }
  const packed = zlib.deflateRawSync(Buffer.from(JSON.stringify(data)), { level: 9 }).toString('base64url');
  return { code: PREFIX + packed, skipped };
}

export function decodeProfileCode(code: string): ShareData {
  const clean = code.trim().replace(/\s+/g, '');
  if (!clean.startsWith(PREFIX)) throw new Error('Это не код сборки Neon Launcher');
  let data: ShareData;
  try {
    data = JSON.parse(zlib.inflateRawSync(Buffer.from(clean.slice(PREFIX.length), 'base64url')).toString('utf8'));
  } catch {
    throw new Error('Код сборки повреждён — скопируй его целиком');
  }
  if (!data.v || !['vanilla', 'fabric', 'forge'].includes(data.l)) throw new Error('В коде нет версии игры');
  return data;
}

/** Создаёт профиль по коду и ставит моды/шейдеры. onStep — для прогресса. */
export async function importProfileCode(
  code: string,
  onStep: (done: number, total: number, label: string) => void,
): Promise<{ profile: Profile; failed: string[] }> {
  const d = decodeProfileCode(code);
  const profile = await saveProfile({
    name: d.n || `${d.l} ${d.v}`,
    mcVersion: d.v,
    loader: d.l,
    loaderVersion: d.lv,
    serverAddress: d.s,
    serverName: d.sn,
    autoJoin: d.j === 1,
    ...(d.r ? { ramMb: d.r } : {}),
  });

  const jobs: { kind: 'mod' | 'shader'; id: string; ver?: string }[] = [
    ...(d.m ?? []).map(([id, ver]) => ({ kind: 'mod' as const, id, ver })),
    ...(d.sh ?? []).map(([id, ver]) => ({ kind: 'shader' as const, id, ver })),
  ];
  const failed: string[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    onStep(i, jobs.length, j.kind === 'mod' ? 'Ставлю моды' : 'Ставлю шейдеры');
    try {
      await installContent(profile, j.kind, j.id, j.ver);
    } catch (e) {
      failed.push(`${j.id}: ${(e as Error).message}`);
    }
  }
  if (d.as) await activateShaderByProject(profile, d.as).catch(() => undefined);
  onStep(jobs.length, jobs.length, 'Готово');
  return { profile, failed };
}
