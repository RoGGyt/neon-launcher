// Оффлайн-аккаунт и вход через Ely.by (Yggdrasil-совместимый сервер со скинами)
import crypto from 'crypto';
import path from 'path';
import { paths } from './paths';
import { downloadFile, fetchJson, fetchOk, needsDownload } from './net';
import type { Account } from '../shared/types';

const ELY_AUTH = 'https://authserver.ely.by/auth';
const AUTHLIB_LATEST = 'https://authlib-injector.yushi.moe/artifact/latest.json';

/** UUID как у сервера в offline-mode: UUID v3 от "OfflinePlayer:<ник>" */
export function offlineUuid(name: string): string {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30; // версия 3
  md5[8] = (md5[8] & 0x3f) | 0x80; // вариант IETF
  const h = md5.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function validateNickname(name: string): string | null {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return 'Ник: 3–16 символов, только латиница, цифры и _';
  return null;
}

export function offlineAccount(name: string): Account {
  const err = validateNickname(name);
  if (err) throw new Error(err);
  return { type: 'offline', name, uuid: offlineUuid(name) };
}

function dashed(id: string): string {
  return id.includes('-') ? id : `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

interface YggAuth {
  accessToken: string;
  clientToken: string;
  selectedProfile?: { id: string; name: string };
}

function elyError(e: unknown): Error {
  const body = (e as { body?: string }).body;
  if (body) {
    try {
      const j = JSON.parse(body);
      if (j.errorMessage === 'Account protected with two factor auth.') return new Error('NEED_TOTP');
      if (j.errorMessage) return new Error(`Ely.by: ${j.errorMessage}`);
    } catch { /* не JSON */ }
  }
  return e as Error;
}

export async function elyLogin(login: string, password: string, totp?: string): Promise<Account> {
  const clientToken = crypto.randomUUID();
  let res: YggAuth;
  try {
    res = await fetchJson<YggAuth>(`${ELY_AUTH}/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: login,
        password: totp ? `${password}:${totp}` : password,
        clientToken,
        requestUser: true,
        agent: { name: 'Minecraft', version: 1 },
      }),
    });
  } catch (e) {
    throw elyError(e);
  }
  if (!res.selectedProfile) throw new Error('У аккаунта Ely.by нет игрового профиля');
  return {
    type: 'ely',
    login,
    name: res.selectedProfile.name,
    uuid: dashed(res.selectedProfile.id),
    accessToken: res.accessToken,
    clientToken: res.clientToken,
  };
}

/** Проверяет токен Ely.by и при необходимости обновляет. Возвращает актуальный аккаунт. */
export async function elyEnsureValid(acc: Extract<Account, { type: 'ely' }>): Promise<Account> {
  try {
    await fetchOk(`${ELY_AUTH}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: acc.accessToken }),
    });
    return acc;
  } catch {
    try {
      const res = await fetchJson<YggAuth>(`${ELY_AUTH}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: acc.accessToken, clientToken: acc.clientToken, requestUser: true }),
      });
      return { ...acc, accessToken: res.accessToken, name: res.selectedProfile?.name ?? acc.name };
    } catch (e) {
      throw new Error(`Сессия Ely.by истекла, войди заново в настройках. (${(e as Error).message})`);
    }
  }
}

export async function elyLogout(acc: Extract<Account, { type: 'ely' }>): Promise<void> {
  await fetchOk(`${ELY_AUTH}/invalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: acc.accessToken, clientToken: acc.clientToken }),
  }).catch(() => undefined);
}

/** authlib-injector нужен, чтобы игра брала скины и сессии у Ely.by */
export async function ensureAuthlibInjector(): Promise<string> {
  const dest = path.join(paths.cache, 'authlib-injector.jar');
  try {
    const latest = await fetchJson<{ download_url: string; checksums?: { sha256?: string } }>(AUTHLIB_LATEST);
    if (await needsDownload({ url: latest.download_url, dest })) await downloadFile({ url: latest.download_url, dest });
  } catch (e) {
    if (await needsDownload({ url: '', dest })) throw new Error(`Не удалось скачать authlib-injector: ${(e as Error).message}`);
  }
  return dest;
}
