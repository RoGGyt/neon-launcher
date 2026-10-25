// Работа с версиями Minecraft: манифест, version.json, наследование, библиотеки, ассеты.
import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { paths, osName, safeJoin } from './paths';
import { DownloadTask, downloadAll, fetchJson, fetchJsonCached, needsDownload, downloadFile } from './net';
import { ZipFile } from './zip';
import type { McVersion, VersionKind } from '../shared/types';

export const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
export const RESOURCES_URL = 'https://resources.download.minecraft.net';
export const LIBRARIES_URL = 'https://libraries.minecraft.net/';

export interface ManifestEntry {
  id: string;
  type: VersionKind;
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
}

export interface Manifest {
  latest: { release: string; snapshot: string };
  versions: ManifestEntry[];
}

export type Features = Record<string, boolean>;

export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: string; arch?: string; version?: string };
  features?: Features;
}

export interface Library {
  name: string;
  url?: string;
  sha1?: string;
  size?: number;
  downloads?: {
    artifact?: { path?: string; url: string; sha1?: string; size?: number };
    classifiers?: Record<string, { path?: string; url: string; sha1?: string; size?: number }>;
  };
  natives?: Record<string, string>;
  extract?: { exclude?: string[] };
  rules?: Rule[];
}

export type Argument = string | { rules?: Rule[]; value: string | string[] };

export interface VersionJson {
  id: string;
  inheritsFrom?: string;
  jar?: string;
  type?: string;
  mainClass: string;
  minecraftArguments?: string;
  arguments?: { game?: Argument[]; jvm?: Argument[] };
  libraries: Library[];
  assetIndex?: { id: string; url: string; sha1: string; size?: number; totalSize?: number };
  assets?: string;
  downloads?: { client?: { url: string; sha1: string; size: number } };
  javaVersion?: { component: string; majorVersion: number };
  logging?: { client?: { argument: string; file: { id: string; url: string; sha1: string; size: number } } };
}

/** Версия после склейки с родителями (inheritsFrom) */
export interface ResolvedVersion extends VersionJson {
  /** id версии, чей .jar используется как клиент */
  jarId: string;
  /** цепочка id от дочерней к базовой */
  chain: string[];
}

// ---------- манифест ----------

let manifestMem: Manifest | null = null;

export async function getManifest(force = false): Promise<Manifest> {
  if (manifestMem && !force) return manifestMem;
  manifestMem = await fetchJsonCached<Manifest>(MANIFEST_URL, path.join(paths.cache, 'version_manifest_v2.json'), 10 * 60_000, force);
  return manifestMem;
}

export async function listVersions(force = false): Promise<McVersion[]> {
  const m = await getManifest(force);
  const installed = new Set<string>();
  try {
    for (const d of await fsp.readdir(paths.versions)) {
      if (fs.existsSync(paths.versionJar(d))) installed.add(d);
    }
  } catch { /* папки ещё нет */ }
  return m.versions.map(v => ({ id: v.id, type: v.type, releaseTime: v.releaseTime, installed: installed.has(v.id) }));
}

// ---------- правила и maven-пути ----------

function archMatches(arch: string | undefined): boolean {
  if (!arch) return true;
  if (arch === 'x86') return process.arch === 'ia32';
  if (arch === 'x64' || arch === 'x86_64') return process.arch === 'x64';
  if (arch === 'arm64' || arch === 'aarch64') return process.arch === 'arm64';
  return false;
}

export function rulesAllow(rules: Rule[] | undefined, features: Features = {}): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== osName()) match = false;
      if (!archMatches(r.os.arch)) match = false;
    }
    if (r.features) {
      for (const [k, v] of Object.entries(r.features)) {
        if (Boolean(features[k]) !== v) match = false;
      }
    }
    if (match) allowed = r.action === 'allow';
  }
  return allowed;
}

/** group:artifact:version[:classifier][@ext] -> относительный путь в maven-репозитории */
export function mavenPath(name: string): string {
  let ext = 'jar';
  let coords = name;
  const at = name.indexOf('@');
  if (at >= 0) {
    ext = name.slice(at + 1);
    coords = name.slice(0, at);
  }
  const [group, artifact, version, classifier] = coords.split(':');
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`;
  return [...group.split('.'), artifact, version, file].join('/');
}

/** Ключ для удаления дублей библиотек: group:artifact[:classifier] */
function libKey(name: string): string {
  const [group, artifact, , classifier] = name.split('@')[0].split(':');
  return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`;
}

function nativeClassifier(lib: Library): string | null {
  if (!lib.natives) return null;
  const c = lib.natives[osName()];
  if (!c) return null;
  return c.replace('${arch}', process.arch === 'ia32' ? '32' : '64');
}

/** Для новых версий (1.19+) нативки — отдельные библиотеки с классификатором natives-*. Отсеиваем чужую архитектуру. */
function classpathNativeArchOk(name: string): boolean {
  const classifier = name.split('@')[0].split(':')[3];
  if (!classifier || !classifier.startsWith('natives-')) return true;
  const isArm = /arm64|aarch64/.test(classifier);
  const isX86 = /-x86$/.test(classifier);
  if (process.arch === 'arm64') return isArm;
  if (process.arch === 'ia32') return isX86;
  return !isArm && !isX86;
}

// ---------- version.json ----------

export async function readVersionJson(id: string): Promise<VersionJson | null> {
  try {
    return JSON.parse(await fsp.readFile(paths.versionJson(id), 'utf8'));
  } catch {
    return null;
  }
}

/** Скачивает version.json ванильной версии, если его нет локально */
export async function ensureVersionJson(id: string): Promise<VersionJson> {
  const local = await readVersionJson(id);
  if (local) return local;
  const m = await getManifest();
  const entry = m.versions.find(v => v.id === id);
  if (!entry) throw new Error(`Версия ${id} не найдена ни локально, ни в манифесте Mojang`);
  const dest = paths.versionJson(id);
  await downloadFile({ url: entry.url, dest, sha1: entry.sha1 });
  return JSON.parse(await fsp.readFile(dest, 'utf8'));
}

function mergeArgs(parent?: Argument[], child?: Argument[]): Argument[] | undefined {
  if (!parent && !child) return undefined;
  return [...(parent ?? []), ...(child ?? [])];
}

/** Склеивает версию с родителями по inheritsFrom (Fabric/Forge поверх ванили) */
export async function resolveVersion(id: string): Promise<ResolvedVersion> {
  const chain: VersionJson[] = [];
  let cur: string | undefined = id;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) throw new Error(`Циклическое наследование версий: ${cur}`);
    seen.add(cur);
    const v: VersionJson = await ensureVersionJson(cur);
    chain.push(v);
    cur = v.inheritsFrom;
  }

  // идём от базовой к дочерней
  let result: VersionJson = { ...chain[chain.length - 1] };
  let jarId = result.jar ?? result.id;
  for (let i = chain.length - 2; i >= 0; i--) {
    const child = chain[i];
    const libs: Library[] = [];
    const keys = new Set<string>();
    for (const l of [...child.libraries, ...result.libraries]) {
      const k = libKey(l.name);
      if (keys.has(k)) continue;
      keys.add(k);
      libs.push(l);
    }
    result = {
      ...result,
      ...child,
      libraries: libs,
      mainClass: child.mainClass ?? result.mainClass,
      minecraftArguments: child.minecraftArguments ?? result.minecraftArguments,
      arguments: (child.arguments || result.arguments) ? {
        game: mergeArgs(result.arguments?.game, child.arguments?.game),
        jvm: mergeArgs(result.arguments?.jvm, child.arguments?.jvm),
      } : undefined,
      assetIndex: child.assetIndex ?? result.assetIndex,
      assets: child.assets ?? result.assets,
      downloads: child.downloads ?? result.downloads,
      javaVersion: child.javaVersion ?? result.javaVersion,
      logging: child.logging ?? result.logging,
    };
    if (child.jar) jarId = child.jar;
    else if (child.downloads?.client) jarId = child.id;
  }
  return { ...result, id, jarId, chain: chain.map(c => c.id) };
}

// ---------- библиотеки ----------

export interface LibraryPlan {
  downloads: DownloadTask[];
  classpath: string[];
  nativeJars: { file: string; exclude: string[] }[];
  /** файлы, которые должны уже лежать на диске (генерирует установщик Forge) */
  mustExist: string[];
}

export function planLibraries(v: ResolvedVersion, features: Features = {}): LibraryPlan {
  const plan: LibraryPlan = { downloads: [], classpath: [], nativeJars: [], mustExist: [] };
  for (const lib of v.libraries) {
    if (!rulesAllow(lib.rules, features)) continue;
    if (!classpathNativeArchOk(lib.name)) continue;

    // старый формат нативок (до 1.19): natives + classifiers
    const nc = nativeClassifier(lib);
    if (nc) {
      const c = lib.downloads?.classifiers?.[nc];
      const rel = c?.path ?? mavenPath(`${lib.name}:${nc}`);
      const file = safeJoin(paths.libraries, rel);
      const url = c?.url ?? (lib.url ?? LIBRARIES_URL) + mavenPath(`${lib.name}:${nc}`);
      plan.downloads.push({ url, dest: file, sha1: c?.sha1, size: c?.size });
      plan.nativeJars.push({ file, exclude: lib.extract?.exclude ?? ['META-INF/'] });
    }

    // обычный jar на classpath
    const art = lib.downloads?.artifact;
    if (lib.downloads && !art) continue; // библиотека только с нативками
    const rel = art?.path ?? mavenPath(lib.name);
    const file = safeJoin(paths.libraries, rel);
    const url = art ? art.url : (lib.url ?? LIBRARIES_URL).replace(/\/?$/, '/') + mavenPath(lib.name);
    if (url) {
      plan.downloads.push({ url, dest: file, sha1: art?.sha1 ?? lib.sha1, size: art?.size ?? lib.size });
    } else {
      plan.mustExist.push(file);
    }
    if (!plan.classpath.includes(file)) plan.classpath.push(file);
  }
  return plan;
}

const NATIVE_EXT = /\.(dll|so|dylib|jnilib)$/i;

export async function extractNatives(v: ResolvedVersion, plan: LibraryPlan): Promise<string> {
  const dir = paths.nativesDir(v.id);
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  for (const n of plan.nativeJars) {
    const zip = await ZipFile.open(n.file);
    await zip.extractTo(dir, name => !n.exclude.some(ex => name.startsWith(ex)) && (NATIVE_EXT.test(name) || !name.includes('/')));
  }
  return dir;
}

// ---------- ассеты ----------

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
  virtual?: boolean;
  map_to_resources?: boolean;
}

export interface AssetsResult {
  indexId: string;
  /** путь для ${game_assets} у очень старых версий */
  legacyDir: string | null;
}

export async function installAssets(
  v: ResolvedVersion,
  gameDir: string,
  concurrency: number,
  onProgress: (done: number, total: number) => void,
): Promise<AssetsResult> {
  if (!v.assetIndex) throw new Error(`У версии ${v.id} нет assetIndex`);
  const idxFile = path.join(paths.assets, 'indexes', `${v.assetIndex.id}.json`);
  if (await needsDownload({ url: v.assetIndex.url, dest: idxFile, sha1: v.assetIndex.sha1 })) {
    await downloadFile({ url: v.assetIndex.url, dest: idxFile, sha1: v.assetIndex.sha1 });
  }
  const index: AssetIndex = JSON.parse(await fsp.readFile(idxFile, 'utf8'));

  const tasks: DownloadTask[] = Object.values(index.objects).map(o => ({
    url: `${RESOURCES_URL}/${o.hash.slice(0, 2)}/${o.hash}`,
    dest: path.join(paths.assets, 'objects', o.hash.slice(0, 2), o.hash),
    size: o.size,
  }));
  await downloadAll(tasks, concurrency, onProgress);

  // старые версии (до 1.7) читают ассеты не из objects/, а по реальным именам
  let legacyDir: string | null = null;
  if (index.virtual || index.map_to_resources) {
    legacyDir = index.map_to_resources
      ? path.join(gameDir, 'resources')
      : path.join(paths.assets, 'virtual', v.assetIndex.id);
    for (const [name, o] of Object.entries(index.objects)) {
      const target = safeJoin(legacyDir, name);
      if (fs.existsSync(target)) continue;
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(path.join(paths.assets, 'objects', o.hash.slice(0, 2), o.hash), target);
    }
  }
  return { indexId: v.assetIndex.id, legacyDir };
}

// ---------- клиент и логирование ----------

export function clientJarTask(v: ResolvedVersion, base: VersionJson | null): DownloadTask | null {
  const d = base?.downloads?.client ?? v.downloads?.client;
  if (!d) return null;
  return { url: d.url, dest: paths.versionJar(v.jarId), sha1: d.sha1, size: d.size };
}

export function loggingTask(v: ResolvedVersion): { task: DownloadTask; argument: string } | null {
  const l = v.logging?.client;
  if (!l?.file?.url) return null;
  const dest = path.join(paths.assets, 'log_configs', l.file.id);
  return { task: { url: l.file.url, dest, sha1: l.file.sha1, size: l.file.size }, argument: l.argument.replace('${path}', dest) };
}

/** version.json для id, который используется как jarId */
export async function jarOwnerJson(v: ResolvedVersion): Promise<VersionJson | null> {
  return readVersionJson(v.jarId);
}

export { fetchJson };
