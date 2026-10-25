// Синхронизация папки мира с облаком.
// Файлы хранятся как блобы по md5 (app:/worlds/<id>/blobs/<md5>), а manifest.json описывает
// снимок мира. Manifest пишется последним, поэтому прерванная загрузка не ломает мир в облаке.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { safeJoin } from './paths';
import type { Cloud } from './yadisk';

export interface ManifestEntry { h: string; s: number }
export interface WorldManifest {
  v: number;
  name: string;
  files: Record<string, ManifestEntry>;
  by: string;
  at: number;
}

type HashCache = Record<string, { s: number; m: number; h: string }>;

const SKIP = new Set(['session.lock']);
const CONCURRENCY = 4;

export const worldRoot = (id: string) => `app:/worlds/${id}`;
const manifestPath = (id: string) => `${worldRoot(id)}/manifest.json`;
const blobDir = (id: string) => `${worldRoot(id)}/blobs`;

function md5(buf: Buffer) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

async function readCache(file: string): Promise<HashCache> {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return {}; }
}

async function writeCache(file: string, cache: HashCache) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(cache));
}

interface LocalFile { rel: string; abs: string; size: number; mtime: number; hash: string }

/** Все файлы мира с md5 (из кэша, если файл не менялся) */
async function scan(dir: string, cache: HashCache): Promise<Map<string, LocalFile>> {
  const out = new Map<string, LocalFile>();
  async function walk(sub: string) {
    let entries: fs.Dirent[];
    try { entries = await fsp.readdir(path.join(dir, sub), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) { await walk(rel); continue; }
      if (!e.isFile() || SKIP.has(e.name) || e.name.endsWith('.part')) continue;
      const abs = path.join(dir, rel);
      const st = await fsp.stat(abs).catch(() => null);
      if (!st) continue;
      const c = cache[rel];
      const hash = c && c.s === st.size && c.m === st.mtimeMs ? c.h : md5(await fsp.readFile(abs));
      cache[rel] = { s: st.size, m: st.mtimeMs, h: hash };
      out.set(rel, { rel, abs, size: st.size, mtime: st.mtimeMs, hash });
    }
  }
  await walk('');
  for (const k of Object.keys(cache)) if (!out.has(k)) delete cache[k];
  return out;
}

async function pool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let i = 0;
  const errors: Error[] = [];
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const it = items[i++];
      try { await fn(it); } catch (e) { errors.push(e as Error); }
    }
  }));
  if (errors.length) throw errors[0];
}

export async function readManifest(cloud: Cloud, id: string): Promise<WorldManifest | null> {
  return cloud.readJson<WorldManifest>(manifestPath(id));
}

export interface SyncProgress { (done: number, total: number): void }

/**
 * Залить мир в облако. skipRecentMs > 0 — для автосохранения во время игры:
 * файлы, которые менялись только что, берём из прошлого снимка (игра их ещё пишет).
 */
export async function syncUp(
  cloud: Cloud, id: string, dir: string, cacheFile: string, by: string, worldName: string,
  onProgress: SyncProgress = () => undefined, skipRecentMs = 0,
): Promise<{ uploaded: number; bytes: number; version: number }> {
  const cache = await readCache(cacheFile);
  const local = await scan(dir, cache);
  if (!local.has('level.dat')) throw new Error('В папке нет level.dat — это не мир Minecraft');
  const old = await readManifest(cloud, id);
  const now = Date.now();

  const files: Record<string, ManifestEntry> = {};
  for (const f of local.values()) {
    if (skipRecentMs > 0 && now - f.mtime < skipRecentMs) {
      if (old?.files[f.rel]) files[f.rel] = old.files[f.rel];
      continue;
    }
    files[f.rel] = { h: f.hash, s: f.size };
  }

  await cloud.mkdirp(blobDir(id));
  const have = new Set((await cloud.list(blobDir(id))).map(b => b.name));
  const need = [...new Set(Object.entries(files).filter(([, e]) => !have.has(e.h)).map(([rel]) => rel))];
  // один блоб на хэш
  const byHash = new Map<string, string>();
  for (const rel of need) if (!byHash.has(files[rel].h)) byHash.set(files[rel].h, rel);

  let done = 0;
  let bytes = 0;
  const jobs = [...byHash.entries()];
  onProgress(0, jobs.length);
  await pool(jobs, CONCURRENCY, async ([hash, rel]) => {
    const buf = await fsp.readFile(path.join(dir, rel));
    let h = md5(buf);
    if (h !== hash) {
      // файл поменялся после подсчёта хэша — грузим актуальное содержимое
      files[rel] = { h, s: buf.length };
      cache[rel] = { s: buf.length, m: (await fsp.stat(path.join(dir, rel))).mtimeMs, h };
      if (have.has(h)) { done++; onProgress(done, jobs.length); return; }
    }
    await cloud.uploadBuffer(`${blobDir(id)}/${h}`, buf);
    have.add(h);
    bytes += buf.length;
    done++;
    onProgress(done, jobs.length);
  });

  const manifest: WorldManifest = { v: (old?.v ?? 0) + 1, name: worldName, files, by, at: Date.now() };
  await cloud.writeJson(manifestPath(id), manifest);
  await writeCache(cacheFile, cache);

  // уборка: оставляем блобы текущего и прошлого снимка (кто-то может как раз его качать)
  const keep = new Set([...Object.values(files).map(e => e.h), ...Object.values(old?.files ?? {}).map(e => e.h)]);
  const garbage = [...have].filter(h => !keep.has(h));
  await pool(garbage, CONCURRENCY, h => cloud.remove(`${blobDir(id)}/${h}`)).catch(() => undefined);

  return { uploaded: jobs.length, bytes, version: manifest.v };
}

/** Скачать мир из облака: качаются только отличающиеся файлы, лишние удаляются */
export async function syncDown(
  cloud: Cloud, id: string, dir: string, cacheFile: string, onProgress: SyncProgress = () => undefined,
): Promise<{ downloaded: number; version: number }> {
  const manifest = await readManifest(cloud, id);
  if (!manifest) throw new Error('Мира в облаке нет — его удалили или ещё не загрузили');
  await fsp.mkdir(dir, { recursive: true });
  const cache = await readCache(cacheFile);
  const local = await scan(dir, cache);

  const todo = Object.entries(manifest.files).filter(([rel, e]) => local.get(rel)?.hash !== e.h);
  let done = 0;
  onProgress(0, todo.length);
  const fetched = new Map<string, Promise<string>>(); // хэш -> путь уже скачанного файла
  await pool(todo, CONCURRENCY, async ([rel, e]) => {
    const dest = safeJoin(dir, rel);
    const first = fetched.get(e.h);
    if (first) {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(await first, dest);
    } else {
      const p = cloud.downloadFile(`${blobDir(id)}/${e.h}`, dest).then(() => dest);
      fetched.set(e.h, p);
      await p;
    }
    const st = await fsp.stat(dest);
    cache[rel] = { s: st.size, m: st.mtimeMs, h: e.h };
    done++;
    onProgress(done, todo.length);
  });

  for (const rel of local.keys()) {
    if (!(rel in manifest.files)) {
      await fsp.rm(path.join(dir, rel), { force: true });
      delete cache[rel];
    }
  }
  await writeCache(cacheFile, cache);
  return { downloaded: todo.length, version: manifest.v };
}

export async function deleteCloudWorld(cloud: Cloud, id: string) {
  await cloud.remove(worldRoot(id));
}
