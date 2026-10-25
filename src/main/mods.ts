// Контент с Modrinth: моды (папка mods) и шейдерпаки (папка shaderpacks)
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { paths, safeJoin } from './paths';
import { downloadFile, fetchJson } from './net';
import type { ContentKind, InstalledMod, ModrinthHit, Profile } from '../shared/types';

const API = 'https://api.modrinth.com/v2';

/** Чем грузить шейдеры: Iris для Fabric, Oculus (порт Iris) для Forge */
const SHADER_LOADER_MOD: Record<'fabric' | 'forge', { slug: string; title: string }> = {
  fabric: { slug: 'iris', title: 'Iris Shaders' },
  forge: { slug: 'oculus', title: 'Oculus' },
};

interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  version_type: 'release' | 'beta' | 'alpha';
  files: { url: string; filename: string; primary: boolean; hashes: { sha1: string }; size: number }[];
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded' }[];
}

interface ContentMeta {
  projectId: string;
  title: string;
  iconUrl: string | null;
  versionNumber: string;
}

type MetaMap = Record<string, ContentMeta>;

function contentDir(p: Profile, kind: ContentKind) {
  return path.join(paths.profileDir(p.id), kind === 'shader' ? 'shaderpacks' : 'mods');
}

function metaFile(p: Profile, kind: ContentKind) {
  return path.join(paths.profileDir(p.id), kind === 'shader' ? 'neon-shaders.json' : 'neon-mods.json');
}

async function readMeta(p: Profile, kind: ContentKind): Promise<MetaMap> {
  try {
    return JSON.parse(await fsp.readFile(metaFile(p, kind), 'utf8'));
  } catch {
    return {};
  }
}

async function writeMeta(p: Profile, kind: ContentKind, meta: MetaMap) {
  await fsp.mkdir(paths.profileDir(p.id), { recursive: true });
  await fsp.writeFile(metaFile(p, kind), JSON.stringify(meta, null, 2));
}

function requireModdable(p: Profile, kind: ContentKind): 'fabric' | 'forge' {
  if (p.loader === 'vanilla') {
    throw new Error(kind === 'shader'
      ? 'Шейдеры работают через Iris — нужен профиль с Fabric (или Forge с Oculus)'
      : 'Моды работают только в профилях с Fabric или Forge');
  }
  return p.loader;
}

// ---------------- поиск ----------------

async function search(facets: string[][], query: string, offset: number) {
  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    limit: '20',
    offset: String(offset),
    index: query ? 'relevance' : 'downloads',
  });
  const res = await fetchJson<{ hits: ModrinthHit[]; total_hits: number }>(`${API}/search?${params}`);
  return { hits: res.hits, total: res.total_hits };
}

export async function searchContent(p: Profile, kind: ContentKind, query: string, offset: number) {
  const loader = requireModdable(p, kind);
  if (kind === 'mod') {
    return search([['project_type:mod'], [`categories:${loader}`], [`versions:${p.mcVersion}`]], query, offset);
  }
  // большинство шейдеров не привязаны жёстко к версии игры — если под версию пусто, ищем без неё
  const exact = await search([['project_type:shader'], ['categories:iris'], [`versions:${p.mcVersion}`]], query, offset);
  if (exact.total > 0 || offset > 0) return exact;
  return search([['project_type:shader'], ['categories:iris']], query, offset);
}

// ---------------- установка ----------------

async function listVersions(projectId: string, loaders: string[], mc?: string): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams({ loaders: JSON.stringify(loaders) });
  if (mc) params.set('game_versions', JSON.stringify([mc]));
  return fetchJson<ModrinthVersion[]>(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`);
}

async function bestVersion(projectId: string, kind: ContentKind, loader: string, mc: string): Promise<ModrinthVersion | null> {
  const pick = (list: ModrinthVersion[]) => list.find(v => v.version_type === 'release') ?? list[0] ?? null;
  if (kind === 'mod') return pick(await listVersions(projectId, [loader], mc));
  return pick(await listVersions(projectId, ['iris'], mc)) ?? pick(await listVersions(projectId, ['iris']));
}

/** Ставит мод/шейдер и обязательные зависимости. Возвращает названия установленного. */
export async function installContent(p: Profile, kind: ContentKind, projectId: string): Promise<string[]> {
  const loader = requireModdable(p, kind);
  const installed: string[] = [];

  if (kind === 'shader') {
    installed.push(...await ensureShaderLoader(p, loader));
  }

  const dir = contentDir(p, kind);
  await fsp.mkdir(dir, { recursive: true });
  const meta = await readMeta(p, kind);
  const visiting = new Set<string>();

  async function install(id: string, isDependency: boolean) {
    if (visiting.has(id)) return;
    visiting.add(id);
    const ver = await bestVersion(id, kind, loader, p.mcVersion);
    if (!ver) {
      if (isDependency) return;
      throw new Error(kind === 'shader' ? 'У этого шейдера нет версии для Iris' : `У мода нет версии для ${loader} ${p.mcVersion}`);
    }
    const realId = ver.project_id;
    visiting.add(realId);
    if (isDependency && Object.values(meta).some(m => m.projectId === realId)) return;

    const project = await fetchJson<{ title: string; icon_url: string | null }>(`${API}/project/${encodeURIComponent(realId)}`);
    const file = ver.files.find(f => f.primary) ?? ver.files[0];
    if (!file) throw new Error(`У ${project.title} нет файлов`);

    // убираем старую версию этого же проекта
    for (const [fname, m] of Object.entries(meta)) {
      if (m.projectId === realId && fname !== file.filename) {
        await fsp.rm(path.join(dir, fname), { recursive: true, force: true });
        await fsp.rm(path.join(dir, `${fname}.disabled`), { force: true });
        delete meta[fname];
      }
    }

    await downloadFile({ url: file.url, dest: safeJoin(dir, file.filename), sha1: file.hashes.sha1, size: file.size });
    meta[file.filename] = { projectId: realId, title: project.title, iconUrl: project.icon_url, versionNumber: ver.version_number };
    installed.push(project.title);

    if (kind === 'mod') {
      for (const dep of ver.dependencies) {
        if (dep.dependency_type === 'required' && dep.project_id) await install(dep.project_id, true);
      }
    } else if (!(await getActiveShader(p))) {
      // первый шейдер сразу включаем
      await writeShaderConfig(p, file.filename, true);
    }
  }

  await install(projectId, false);
  await writeMeta(p, kind, meta);
  return installed;
}

/** Iris/Oculus: если в папке mods их нет — ставим (Sodium подтянется зависимостью) */
async function ensureShaderLoader(p: Profile, loader: 'fabric' | 'forge'): Promise<string[]> {
  const need = SHADER_LOADER_MOD[loader];
  const modsDir = contentDir(p, 'mod');
  const files = fs.existsSync(modsDir) ? await fsp.readdir(modsDir) : [];
  if (files.some(f => f.toLowerCase().startsWith(need.slug) && f.endsWith('.jar'))) return [];
  const meta = await readMeta(p, 'mod');
  const project = await fetchJson<{ id: string }>(`${API}/project/${need.slug}`);
  if (Object.values(meta).some(m => m.projectId === project.id)) return [];
  try {
    return await installContent(p, 'mod', project.id);
  } catch {
    throw new Error(`${need.title} пока нет для ${p.mcVersion}, без него шейдеры не заработают. Попробуй другую версию игры.`);
  }
}

// ---------------- активный шейдер (Iris / Oculus) ----------------

function shaderConfigFiles(p: Profile): string[] {
  const cfg = path.join(paths.profileDir(p.id), 'config');
  return [path.join(cfg, 'iris.properties'), path.join(cfg, 'oculus.properties')];
}

async function readProps(file: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    for (const line of (await fsp.readFile(file, 'utf8')).split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i > 0) map.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
    }
  } catch { /* файла нет */ }
  return map;
}

async function writeShaderConfig(p: Profile, pack: string | null, enabled: boolean) {
  for (const file of shaderConfigFiles(p)) {
    const props = await readProps(file);
    if (pack !== null) props.set('shaderPack', pack);
    props.set('enableShaders', String(enabled));
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, [...props].map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  }
}

async function getActiveShader(p: Profile): Promise<string | null> {
  const props = await readProps(shaderConfigFiles(p)[0]);
  return props.get('enableShaders') === 'true' ? props.get('shaderPack') ?? null : null;
}

// ---------------- список / переключение / удаление ----------------

export async function listContent(p: Profile, kind: ContentKind): Promise<InstalledMod[]> {
  const dir = contentDir(p, kind);
  if (!fs.existsSync(dir)) return [];
  const meta = await readMeta(p, kind);
  const active = kind === 'shader' ? await getActiveShader(p) : null;
  const out: InstalledMod[] = [];
  for (const name of await fsp.readdir(dir)) {
    const full = path.join(dir, name);
    const st = await fsp.stat(full);
    let base: string;
    let enabled: boolean;
    if (kind === 'mod') {
      enabled = name.endsWith('.jar');
      if (!enabled && !name.endsWith('.jar.disabled')) continue;
      base = enabled ? name : name.slice(0, -'.disabled'.length);
    } else {
      // шейдерпак — это .zip или распакованная папка
      if (!st.isDirectory() && !name.toLowerCase().endsWith('.zip')) continue;
      base = name;
      enabled = name === active;
    }
    const m = meta[base];
    out.push({
      fileName: base,
      enabled,
      title: m?.title ?? base.replace(/\.(jar|zip)$/i, ''),
      projectId: m?.projectId,
      iconUrl: m?.iconUrl,
      versionNumber: m?.versionNumber,
      sizeBytes: st.isDirectory() ? 0 : st.size,
    });
  }
  return out.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title));
}

/** Мод: вкл/выкл. Шейдер: сделать активным (или выключить, если уже активен). */
export async function toggleContent(p: Profile, kind: ContentKind, fileName: string): Promise<void> {
  const dir = contentDir(p, kind);
  if (kind === 'shader') {
    if (!fs.existsSync(safeJoin(dir, fileName))) throw new Error('Шейдер не найден');
    const active = await getActiveShader(p);
    await writeShaderConfig(p, fileName, active !== fileName);
    return;
  }
  const on = safeJoin(dir, fileName);
  const off = `${on}.disabled`;
  if (fs.existsSync(on)) await fsp.rename(on, off);
  else if (fs.existsSync(off)) await fsp.rename(off, on);
}

export async function deleteContent(p: Profile, kind: ContentKind, fileName: string): Promise<void> {
  const dir = contentDir(p, kind);
  const file = safeJoin(dir, fileName);
  if (kind === 'shader' && (await getActiveShader(p)) === fileName) await writeShaderConfig(p, null, false);
  await fsp.rm(file, { recursive: true, force: true });
  await fsp.rm(`${file}.disabled`, { force: true });
  const meta = await readMeta(p, kind);
  delete meta[fileName];
  await writeMeta(p, kind, meta);
}

export function contentFolder(p: Profile, kind: ContentKind) {
  return contentDir(p, kind);
}
