// Яндекс Диск: вход через OAuth и работа с папкой приложения (app:/)
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { USER_AGENT } from './net';

/**
 * ClientID приложения на oauth.yandex.ru (платформа «Веб-сервисы»,
 * доступ «Яндекс Диск REST API → папка приложения»). Не секрет.
 */
export const YANDEX_CLIENT_ID = '89c2ccced96b48f796267555eb50a9e2';
export const YANDEX_REDIRECT = 'https://oauth.yandex.ru/verification_code';
const API = 'https://cloud-api.yandex.net/v1/disk';

export function yandexAuthUrl(): string {
  if (!YANDEX_CLIENT_ID) throw new Error('Облачные миры ещё не настроены: в лаунчере не указан ID приложения Яндекса');
  const q = new URLSearchParams({ response_type: 'token', client_id: YANDEX_CLIENT_ID, redirect_uri: YANDEX_REDIRECT, force_confirm: 'yes' });
  return `https://oauth.yandex.ru/authorize?${q}`;
}

/** Достаёт токен из адреса редиректа (#access_token=...&expires_in=...) */
export function parseAuthRedirect(url: string): { token: string; expiresAt: number } | { error: string } | null {
  if (!url.startsWith(YANDEX_REDIRECT)) return null;
  const hash = new URLSearchParams(url.split('#')[1] ?? '');
  const query = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
  const token = hash.get('access_token');
  if (token) return { token, expiresAt: Date.now() + Number(hash.get('expires_in') ?? 31536000) * 1000 };
  const err = hash.get('error') ?? query.get('error');
  if (err) return { error: err === 'access_denied' ? 'Доступ к Яндекс Диску не разрешён' : `Яндекс: ${err}` };
  return null;
}

export interface DiskItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  md5?: string;
  created?: string;
}

export class YaDiskError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Минимальный клиент REST API Диска. Все пути — внутри app:/ */
export class YaDisk {
  constructor(private token: string) {}

  private async req(method: string, endpoint: string, params: Record<string, string>, okStatuses: number[] = [200, 201, 202, 204]): Promise<any> {
    const url = `${API}${endpoint}?${new URLSearchParams(params)}`;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { method, headers: { Authorization: `OAuth ${this.token}`, 'User-Agent': USER_AGENT, Accept: 'application/json' } });
      } catch (e) {
        if (attempt < 3) { await sleep(800 * (attempt + 1)); continue; }
        throw new YaDiskError(`Нет связи с Яндекс Диском: ${(e as Error).message}`, 0);
      }
      if (okStatuses.includes(res.status)) {
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(1000 * (attempt + 1)); continue; }
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.description || j.message || msg; } catch { /* не JSON */ }
      if (res.status === 401) msg = 'Доступ к Яндекс Диску истёк — войди заново';
      if (res.status === 507) msg = 'На Яндекс Диске закончилось место';
      throw new YaDiskError(msg, res.status);
    }
  }

  async info(p: string): Promise<DiskItem | null> {
    try {
      return await this.req('GET', '/resources', { path: p, fields: 'name,path,type,size,md5,created' });
    } catch (e) {
      if (e instanceof YaDiskError && e.status === 404) return null;
      throw e;
    }
  }

  async list(dir: string): Promise<DiskItem[]> {
    const out: DiskItem[] = [];
    for (let offset = 0; ; offset += 1000) {
      let r: any;
      try {
        r = await this.req('GET', '/resources', { path: dir, limit: '1000', offset: String(offset), fields: '_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.size,_embedded.items.md5,_embedded.items.created,_embedded.total' });
      } catch (e) {
        if (e instanceof YaDiskError && e.status === 404) return out;
        throw e;
      }
      const items: DiskItem[] = r?._embedded?.items ?? [];
      out.push(...items);
      if (items.length < 1000) return out;
    }
  }

  async mkdirp(dir: string): Promise<void> {
    const parts = dir.replace(/^app:\/?/, '').split('/').filter(Boolean);
    let cur = 'app:';
    for (const part of parts) {
      cur = `${cur}/${part}`;
      try {
        await this.req('PUT', '/resources', { path: cur }, [201]);
      } catch (e) {
        if (!(e instanceof YaDiskError && e.status === 409)) throw e; // 409 — уже есть
      }
    }
  }

  async uploadBuffer(p: string, data: Buffer, overwrite = true): Promise<void> {
    const { href } = await this.req('GET', '/resources/upload', { path: p, overwrite: String(overwrite) });
    await this.put(href, data, data.length);
  }

  async uploadFile(p: string, file: string): Promise<void> {
    const { href } = await this.req('GET', '/resources/upload', { path: p, overwrite: 'true' });
    const size = (await fsp.stat(file)).size;
    await this.put(href, fs.createReadStream(file), size);
  }

  private async put(href: string, body: Buffer | fs.ReadStream, size: number) {
    const res = await fetch(href, {
      method: 'PUT',
      headers: { 'Content-Length': String(size), 'User-Agent': USER_AGENT },
      body: Buffer.isBuffer(body) ? new Uint8Array(body) : (Readable.toWeb(body as fs.ReadStream) as any),
      // @ts-ignore — нужно для потоковой отправки тела в Node
      duplex: 'half',
    });
    if (![200, 201, 202].includes(res.status)) throw new YaDiskError(`Не удалось загрузить файл (HTTP ${res.status})`, res.status);
  }

  private async downloadHref(p: string): Promise<string> {
    const { href } = await this.req('GET', '/resources/download', { path: p });
    return href;
  }

  async downloadBuffer(p: string): Promise<Buffer | null> {
    let href: string;
    try { href = await this.downloadHref(p); } catch (e) {
      if (e instanceof YaDiskError && e.status === 404) return null;
      throw e;
    }
    const res = await fetch(href, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new YaDiskError(`Не удалось скачать (HTTP ${res.status})`, res.status);
    return Buffer.from(await res.arrayBuffer());
  }

  async downloadFile(p: string, dest: string): Promise<void> {
    const href = await this.downloadHref(p);
    const res = await fetch(href, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok || !res.body) throw new YaDiskError(`Не удалось скачать (HTTP ${res.status})`, res.status);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmp));
    await fsp.rename(tmp, dest);
  }

  async remove(p: string): Promise<void> {
    try {
      await this.req('DELETE', '/resources', { path: p, permanently: 'true' });
    } catch (e) {
      if (!(e instanceof YaDiskError && e.status === 404)) throw e;
    }
  }

  async readJson<T>(p: string): Promise<T | null> {
    const buf = await this.downloadBuffer(p);
    return buf ? JSON.parse(buf.toString('utf8')) as T : null;
  }

  async writeJson(p: string, data: unknown): Promise<void> {
    await this.uploadBuffer(p, Buffer.from(JSON.stringify(data)));
  }

  /** Сколько места на Диске */
  async quota(): Promise<{ total: number; used: number }> {
    const r = await this.req('GET', '', { fields: 'total_space,used_space' });
    return { total: r.total_space, used: r.used_space };
  }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/** Интерфейс облака — его же реализует фейк в тестах */
export type Cloud = Pick<YaDisk, 'info' | 'list' | 'mkdirp' | 'uploadBuffer' | 'uploadFile' | 'downloadBuffer' | 'downloadFile' | 'remove' | 'readJson' | 'writeJson'>;
