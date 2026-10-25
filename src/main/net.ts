import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export const USER_AGENT = 'RoGGyt/neon-launcher/1.0.0 (github.com/RoGGyt)';

export interface DownloadTask {
  url: string;
  dest: string;
  sha1?: string;
  size?: number;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchOk(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT);
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} для ${url}${body ? `: ${body.slice(0, 300)}` : ''}`) as Error & { status?: number; body?: string };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res;
}

export async function fetchJson<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  return withRetry(async () => (await fetchOk(url, init)).json() as Promise<T>);
}

/** JSON с кэшем на диске: если сеть недоступна, берём последний сохранённый ответ */
export async function fetchJsonCached<T = any>(url: string, cacheFile: string, maxAgeMs: number, force = false): Promise<T> {
  try {
    const st = await fsp.stat(cacheFile);
    if (!force && Date.now() - st.mtimeMs < maxAgeMs) {
      return JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    }
  } catch { /* кэша нет */ }
  try {
    const data = await fetchJson<T>(url);
    await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
    await fsp.writeFile(cacheFile, JSON.stringify(data));
    return data;
  } catch (e) {
    try {
      return JSON.parse(await fsp.readFile(cacheFile, 'utf8'));
    } catch {
      throw e;
    }
  }
}

export async function sha1File(file: string): Promise<string> {
  const hash = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

/** Нужно ли качать файл (нет файла / не совпал размер или sha1) */
export async function needsDownload(t: DownloadTask): Promise<boolean> {
  try {
    const st = await fsp.stat(t.dest);
    if (!st.isFile()) return true;
    if (t.size !== undefined && st.size !== t.size) return true;
    if (t.sha1) return (await sha1File(t.dest)) !== t.sha1.toLowerCase();
    return st.size === 0;
  } catch {
    return true;
  }
}

export async function downloadFile(t: DownloadTask): Promise<void> {
  await fsp.mkdir(path.dirname(t.dest), { recursive: true });
  const tmp = `${t.dest}.part`;
  await withRetry(async () => {
    const res = await fetchOk(t.url);
    if (!res.body) throw new Error(`Пустой ответ: ${t.url}`);
    const hash = crypto.createHash('sha1');
    const body = Readable.fromWeb(res.body as any);
    body.on('data', (chunk: Buffer) => hash.update(chunk));
    await pipeline(body, fs.createWriteStream(tmp));
    if (t.sha1) {
      const got = hash.digest('hex');
      if (got !== t.sha1.toLowerCase()) {
        await fsp.rm(tmp, { force: true });
        throw new Error(`Хэш не совпал для ${path.basename(t.dest)} (ожидали ${t.sha1}, получили ${got})`);
      }
    }
    await fsp.rename(tmp, t.dest);
  }, 4);
}

/**
 * Параллельно скачивает список файлов, пропуская уже скачанные.
 * onProgress(done, total) вызывается после каждого файла.
 */
export async function downloadAll(
  tasks: DownloadTask[],
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  // убираем дубликаты по пути назначения
  const unique = new Map<string, DownloadTask>();
  for (const t of tasks) unique.set(path.resolve(t.dest), t);
  const list = [...unique.values()];

  let done = 0;
  let index = 0;
  const errors: string[] = [];
  onProgress?.(0, list.length);

  async function worker() {
    while (index < list.length) {
      const t = list[index++];
      try {
        if (await needsDownload(t)) await downloadFile(t);
      } catch (e) {
        errors.push(`${path.basename(t.dest)}: ${(e as Error).message}`);
      }
      done++;
      onProgress?.(done, list.length);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, worker));
  if (errors.length) {
    throw new Error(`Не удалось скачать ${errors.length} файл(ов):\n${errors.slice(0, 5).join('\n')}`);
  }
}
