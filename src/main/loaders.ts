// Установка модлоадеров: Fabric и Forge
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { paths } from './paths';
import { downloadFile, fetchJson, fetchJsonCached, needsDownload } from './net';
import { ZipFile } from './zip';
import { mavenPath, VersionJson, Library } from './mojang';
import type { LoaderVersion } from '../shared/types';

const FABRIC_META = 'https://meta.fabricmc.net/v2';
const FORGE_FILES = 'https://files.minecraftforge.net/net/minecraftforge/forge';
const FORGE_MAVEN = 'https://maven.minecraftforge.net';

// ---------------- Fabric ----------------

export async function listFabric(mc: string): Promise<LoaderVersion[]> {
  const list = await fetchJson<{ loader: { version: string; stable: boolean } }[]>(`${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}`);
  const out: LoaderVersion[] = list.map(x => ({ id: x.loader.version, stable: x.loader.stable }));
  const firstStable = out.find(x => x.stable);
  if (firstStable) firstStable.recommended = true;
  return out;
}

/** Ставит профиль Fabric, возвращает id версии (fabric-loader-X-MC) */
export async function installFabric(mc: string, loader: string): Promise<string> {
  const json = await fetchJson<VersionJson>(`${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(loader)}/profile/json`);
  const file = paths.versionJson(json.id);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(json, null, 2));
  return json.id;
}

// ---------------- Forge ----------------

export async function listForge(mc: string): Promise<LoaderVersion[]> {
  const meta = await fetchJsonCached<Record<string, string[]>>(`${FORGE_FILES}/maven-metadata.json`, path.join(paths.cache, 'forge-meta.json'), 3600_000);
  const promos = await fetchJsonCached<{ promos: Record<string, string> }>(`${FORGE_FILES}/promotions_slim.json`, path.join(paths.cache, 'forge-promos.json'), 3600_000)
    .catch(() => ({ promos: {} as Record<string, string> }));
  const rec = promos.promos[`${mc}-recommended`];
  const latest = promos.promos[`${mc}-latest`];
  const list = (meta[mc] ?? []).slice().reverse();
  return list.map(full => {
    const short = full.slice(mc.length + 1).split('-')[0];
    return { id: full, stable: short === rec || short === latest, recommended: short === rec || (!rec && short === latest) };
  });
}

/** Установщик Forge старого формата (1.12.2 и ниже): ставим вручную, без запуска java */
async function installForgeLegacy(zip: ZipFile, profile: any, mc: string): Promise<string> {
  type LegacyLib = Library & { clientreq?: boolean; serverreq?: boolean };
  const info = profile.versionInfo as VersionJson;
  const libs = info.libraries as LegacyLib[];
  const install = profile.install as { path: string; filePath: string };

  // кладём universal-jar из установщика в libraries/
  const entry = zip.entries.find(e => e.name === install.filePath);
  if (!entry) throw new Error('В установщике Forge нет universal-jar');
  const dest = path.join(paths.libraries, mavenPath(install.path));
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, zip.read(entry));

  info.libraries = libs
    .filter(l => !(l.serverreq && !l.clientreq))
    .map(l => {
      const copy: any = { ...l };
      if (copy.url) copy.url = String(copy.url).replace(/^https?:\/\/files\.minecraftforge\.net\/maven\/?/, `${FORGE_MAVEN}/`);
      delete copy.checksums; delete copy.clientreq; delete copy.serverreq;
      return copy;
    });
  info.inheritsFrom = info.inheritsFrom ?? mc;
  info.jar = info.jar ?? mc;
  const file = paths.versionJson(info.id);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(info, null, 2));
  return info.id;
}

/** Установщик нового формата (1.13+): запускаем его в headless-режиме */
async function installForgeModern(installer: string, versionId: string, java: string, log: (s: string) => void): Promise<string> {
  const profilesFile = path.join(paths.root, 'launcher_profiles.json');
  if (!fs.existsSync(profilesFile)) {
    await fsp.writeFile(profilesFile, JSON.stringify({ profiles: {}, selectedProfile: '' }, null, 2));
  }
  await new Promise<void>((resolve, reject) => {
    const p = spawn(java, ['-jar', installer, '--installClient', paths.root], { cwd: paths.cache, windowsHide: true });
    const onData = (d: Buffer) => d.toString().split(/\r?\n/).filter(Boolean).forEach(l => log(`[Forge] ${l}`));
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`Установщик Forge завершился с кодом ${code}. Подробности во вкладке «Консоль».`)));
  });
  if (!fs.existsSync(paths.versionJson(versionId))) {
    throw new Error(`Forge установился, но версия ${versionId} не появилась`);
  }
  return versionId;
}

export async function installForge(mc: string, forgeFull: string, getJava: () => Promise<string>, log: (s: string) => void): Promise<string> {
  const url = `${FORGE_MAVEN}/net/minecraftforge/forge/${forgeFull}/forge-${forgeFull}-installer.jar`;
  const installer = path.join(paths.cache, 'forge', `forge-${forgeFull}-installer.jar`);
  if (await needsDownload({ url, dest: installer })) {
    log(`Скачиваю установщик Forge ${forgeFull}…`);
    try {
      await downloadFile({ url, dest: installer });
    } catch (e) {
      throw new Error(`Для Forge ${forgeFull} нет автоустановщика (очень старые версии не поддерживаются). ${(e as Error).message}`);
    }
  }
  const zip = await ZipFile.open(installer);
  const profileText = zip.readText('install_profile.json');
  if (!profileText) throw new Error('Неизвестный формат установщика Forge');
  const profile = JSON.parse(profileText);

  if (profile.versionInfo) return installForgeLegacy(zip, profile, mc);

  const versionText = zip.readText(profile.json?.replace(/^\//, '') ?? 'version.json');
  const versionId: string = versionText ? JSON.parse(versionText).id : profile.version;
  if (fs.existsSync(paths.versionJson(versionId))) return versionId;
  log('Запускаю установщик Forge (это может занять пару минут)…');
  return installForgeModern(installer, versionId, await getJava(), log);
}
