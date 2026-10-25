// Менеджер модов: поиск и установка с Modrinth в папку mods профиля
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { paths, safeJoin } from './paths';
import { downloadFile, fetchJson } from './net';
import type { InstalledMod, ModrinthHit, Profile } from '../shared/types';

const API = 'https://api.modrinth.com/v2';

interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  files: { url: string; filename: string; primary: boolean; hashes: { sha1: string }; size: number }[];
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded' }[];
}

interface ModMeta {
  projectId: string;
  title: string;
  iconUrl: string | null;
  versionNumber: string;
}

type MetaMap = Record<string, ModMeta>;

function modsDir(profileId: string) {
  return path.join(paths.profileDir(profileId), 'mods');
}

function metaFile(profileId: string) {
  return path.join(paths.profileDir(profileId), 'neon-mods.json');
}

async function readMeta(profileId: string): Promise<MetaMap> {
  try {
    return JSON.parse(await fsp.readFile(metaFile(profileId), 'utf8'));
  } catch {
    return {};
  }
}

async function writeMeta(profileId: string, meta: MetaMap) {
  await fsp.writeFile(metaFile(profileId), JSON.stringify(meta, null, 2));
}

function requireModdable(p: Profile): 'fabric' | 'forge' {
  if (p.loader === 'vanilla') throw new Error('Моды работают только в профилях с Fabric или Forge');
  return p.loader;
}

export async function searchMods(p: Profile, query: string, offset: number): Promise<{ hits: ModrinthHit[]; total: number }> {
  const loader = requireModdable(p);
  const facets = JSON.stringify([['project_type:mod'], [`categories:${loader}`], [`versions:${p.mcVersion}`]]);
  const params = new URLSearchParams({
    query,
    facets,
    limit: '20',
    offset: String(offset),
    index: query ? 'relevance' : 'downloads',
  });
  const res = await fetchJson<{ hits: ModrinthHit[]; total_hits: number }>(`${API}/search?${params}`);
  return { hits: res.hits, total: res.total_hits };
}

async function bestVersion(projectId: string, loader: string, mc: string): Promise<ModrinthVersion | null> {
  const params = new URLSearchParams({ loaders: JSON.stringify([loader]), game_versions: JSON.stringify([mc]) });
  const list = await fetchJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`);
  return list.find(v => v.version_type === 'release') ?? list[0] ?? null;
}

/** Ставит мод и его обязательные зависимости. Возвращает названия установленного. */
export async function installMod(p: Profile, projectId: string): Promise<string[]> {
  const loader = requireModdable(p);
  const dir = modsDir(p.id);
  await fsp.mkdir(dir, { recursive: true });
  const meta = await readMeta(p.id);
  const installed: string[] = [];
  const visiting = new Set<string>();

  async function install(id: string, isDependency: boolean) {
    if (visiting.has(id)) return;
    visiting.add(id);
    const already = Object.values(meta).some(m => m.projectId === id);
    if (already && isDependency) return;

    const ver = await bestVersion(id, loader, p.mcVersion);
    if (!ver) {
      if (isDependency) return;
      throw new Error(`У мода нет версии для ${loader} ${p.mcVersion}`);
    }
    const project = await fetchJson<{ title: string; icon_url: string | null }>(`${API}/project/${encodeURIComponent(id)}`);
    const file = ver.files.find(f => f.primary) ?? ver.files[0];
    if (!file) throw new Error(`У ${project.title} нет файлов`);

    // убираем старую версию этого же мода
    for (const [fname, m] of Object.entries(meta)) {
      if (m.projectId === id && fname !== file.filename) {
        await fsp.rm(path.join(dir, fname), { force: true });
        await fsp.rm(path.join(dir, `${fname}.disabled`), { force: true });
        delete meta[fname];
      }
    }

    await downloadFile({ url: file.url, dest: safeJoin(dir, file.filename), sha1: file.hashes.sha1, size: file.size });
    meta[file.filename] = { projectId: id, title: project.title, iconUrl: project.icon_url, versionNumber: ver.version_number };
    installed.push(project.title);

    for (const dep of ver.dependencies) {
      if (dep.dependency_type === 'required' && dep.project_id) await install(dep.project_id, true);
    }
  }

  await install(projectId, false);
  await writeMeta(p.id, meta);
  return installed;
}

export async function listMods(p: Profile): Promise<InstalledMod[]> {
  const dir = modsDir(p.id);
  if (!fs.existsSync(dir)) return [];
  const meta = await readMeta(p.id);
  const out: InstalledMod[] = [];
  for (const name of await fsp.readdir(dir)) {
    const enabled = name.endsWith('.jar');
    if (!enabled && !name.endsWith('.jar.disabled')) continue;
    const base = enabled ? name : name.slice(0, -'.disabled'.length);
    const m = meta[base];
    const st = await fsp.stat(path.join(dir, name));
    out.push({
      fileName: base,
      enabled,
      title: m?.title ?? base.replace(/\.jar$/, ''),
      projectId: m?.projectId,
      iconUrl: m?.iconUrl,
      versionNumber: m?.versionNumber,
      sizeBytes: st.size,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export async function toggleMod(p: Profile, fileName: string): Promise<void> {
  const dir = modsDir(p.id);
  const on = safeJoin(dir, fileName);
  const off = `${on}.disabled`;
  if (fs.existsSync(on)) await fsp.rename(on, off);
  else if (fs.existsSync(off)) await fsp.rename(off, on);
}

export async function deleteMod(p: Profile, fileName: string): Promise<void> {
  const dir = modsDir(p.id);
  const file = safeJoin(dir, fileName);
  await fsp.rm(file, { force: true });
  await fsp.rm(`${file}.disabled`, { force: true });
  const meta = await readMeta(p.id);
  delete meta[fileName];
  await writeMeta(p.id, meta);
}

export function modsFolder(p: Profile) {
  return modsDir(p.id);
}
