// Облачный мир: мир лежит на Яндекс Диске, первый вошедший становится хостом,
// остальные сами подключаются к нему. Когда хост уходит, хост переходит к следующему.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { paths, safeJoin } from './paths';
import { resourceFile } from './resources';
import { YaDisk, Cloud } from './yadisk';
import { syncDown, syncUp, readManifest, worldRoot } from './cloudsync';
import { launchProfile, killGame, isRunning, LaunchHooks, LaunchOptions } from './launch';
import { installContent, listContent } from './mods';
import { getSettings, saveSettings, getProfile, updateProfile } from './store';
import type { Profile, CloudWorld } from '../shared/types';

// NEON_CLOUD_TIME_SCALE ускоряет таймеры в тестах; в лаунчере всегда 1
const K = Number(process.env.NEON_CLOUD_TIME_SCALE) || 1;
const BEAT_MS = 15_000 * K;          // как часто хост отмечается «я жив»
const STALE_MS = 60_000 * K;         // хост пропал, если не отмечался столько
const AUTOSAVE_MS = 5 * 60_000 * K;  // автосохранение мира в облако во время игры
const GUEST_CHECK_MS = 8_000 * K;    // как часто гость проверяет, жив ли хост
const SETTLE_MS = 2_500 * K;         // пауза при выборе хоста

export interface Session {
  hostId: string;
  host: string;
  state: 'starting' | 'open' | 'saving';
  address?: string;
  beat: number;
}

export interface CloudUi {
  status(text: string | null): void;
  onGameStart(): void;
  /** вся облачная сессия закончилась (игрок вышел, мир сохранён) */
  onDone(error?: string): void;
}

const sessionPath = (id: string) => `${worldRoot(id)}/session.json`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function installId(): string {
  let id = getSettings().installId;
  if (!id) {
    id = crypto.randomUUID();
    saveSettings({ installId: id }).catch(() => undefined);
  }
  return id;
}

function fresh(s: Session | null): s is Session {
  return Boolean(s && Date.now() - s.beat < STALE_MS);
}

export function readSession(cloud: Cloud, worldId: string) {
  return cloud.readJson<Session>(sessionPath(worldId)).catch(() => null);
}

/** Пытаемся стать хостом. Победитель гонки — тот, чья запись осталась последней. */
export async function acquireHost(cloud: Cloud, worldId: string, me: { id: string; name: string }, settleMs = SETTLE_MS): Promise<boolean> {
  const cur = await readSession(cloud, worldId);
  if (fresh(cur) && cur.hostId !== me.id) return false;
  await cloud.writeJson(sessionPath(worldId), { hostId: me.id, host: me.name, state: 'starting', beat: Date.now() } satisfies Session);
  await sleep(settleMs);
  const check = await readSession(cloud, worldId);
  return check?.hostId === me.id;
}

// ---------------- подготовка профиля ----------------

export function cloudVersionOk(mc: string): boolean {
  const m = /^1\.(\d+)/.exec(mc);
  if (m) return Number(m[1]) >= 20;
  return /^\d{2}\./.test(mc); // 26.x и дальше
}

function worldDir(p: Profile, c: CloudWorld) {
  return safeJoin(path.join(paths.profileDir(p.id), 'saves'), c.folder);
}
function cacheFile(p: Profile) {
  return path.join(paths.profileDir(p.id), '.neon-cloud-cache.json');
}

/** Моды, без которых облачный мир не работает: Fabric API, e4all и наш помощник */
async function ensureHelpers(p: Profile, log: (s: string) => void) {
  const mods = await listContent(p, 'mod');
  const has = (re: RegExp) => mods.some(m => m.enabled && (re.test(m.fileName) || re.test(m.title)));
  if (!has(/^fabric[- ]api/i)) { log('Ставлю Fabric API…'); await installContent(p, 'mod', 'fabric-api'); }
  if (!has(/e4all/i)) { log('Ставлю e4all…'); await installContent(p, 'mod', 'e4all'); }
  const helper = autohostJar();
  if (!helper) throw new Error('В сборке лаунчера нет мода-помощника neon-autohost');
  const dest = path.join(paths.profileDir(p.id), 'mods', 'neon-autohost.jar');
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(helper, dest);
}

function autohostJar(): string | null {
  return resourceFile('neon-autohost.jar');
}

/** e4all: без проверки лицензии (для оффлайн-ников), без приветствий */
async function configureE4all(p: Profile) {
  const want: Record<string, string> = { offlineMode: 'true', offlineWarningShown: 'true', welcomeShown: 'true', hideDomainInChat: 'false', hostEnabled: 'true' };
  const cfg = path.join(paths.profileDir(p.id), 'config');
  for (const file of [path.join(cfg, 'e4all', 'e4all.toml'), path.join(cfg, 'e4all.toml')]) {
    let lines: string[] = [];
    try { lines = (await fsp.readFile(file, 'utf8')).split(/\r?\n/); } catch { /* нет файла */ }
    const seen = new Set<string>();
    lines = lines.map(l => {
      const m = /^\s*([A-Za-z0-9_]+)\s*=/.exec(l);
      if (m && m[1] in want) { seen.add(m[1]); return `${m[1]} = ${want[m[1]]}`; }
      return l;
    });
    for (const [k, v] of Object.entries(want)) if (!seen.has(k)) lines.push(`${k} = ${v}`);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, lines.filter((l, i) => l !== '' || i < lines.length - 1).join('\n') + '\n');
  }
}

// ---------------- игра ----------------

let active: { stop: boolean; busy: boolean } | null = null;

export function cloudActive() { return active !== null; }
/** Пока идёт загрузка мира в облако, лаунчер нельзя закрывать */
export function cloudBusy() { return Boolean(active?.busy); }
export function stopCloud() { if (active) active.stop = true; }

export async function playCloud(profileId: string, hooks: LaunchHooks, ui: CloudUi): Promise<void> {
  if (active) throw new Error('Облачный мир уже запущен');
  const p0 = getProfile(profileId);
  const c = p0.cloud;
  if (!c) throw new Error('Это не облачный мир');
  if (p0.loader !== 'fabric') throw new Error('Облачный мир работает только с Fabric');
  if (!cloudVersionOk(p0.mcVersion)) throw new Error('Облачный мир работает на версиях 1.20 и новее');
  const acc = getSettings().account;
  if (!acc) throw new Error('Сначала введи ник');

  const ctl = active = { stop: false, busy: false };
  const cloud = new YaDisk(c.token);
  const me = { id: installId(), name: acc.name };
  const log = (s: string) => hooks.log(`[Облако] ${s}`);

  // всё дальнейшее — в фоне; кнопка «Играть» сразу освобождается
  (async () => {
    let error: string | undefined;
    try {
      ui.status('Подготовка…');
      await ensureHelpers(p0, log);
      await configureE4all(p0);
      let p = getProfile(profileId);

      // мир не успел уйти в облако в прошлый раз (вылет, нет сети) — сначала зальём его
      if (p.cloudPendingUpload) await uploadPending(p, cloud, me, hooks, ui);

      while (!ctl.stop) {
        p = getProfile(profileId);
        const s = await readSession(cloud, c.worldId);
        if (fresh(s) && s.hostId !== me.id) {
          if (s.state === 'open' && s.address) {
            const r = await runGuest(p, cloud, s, ctl, hooks, ui);
            if (r === 'exit') break;
            ui.status('Хост сменился, переподключаемся…');
            await sleep((1000 + Math.random() * 3000) * K);
            continue;
          }
          ui.status(s.state === 'saving' ? `${s.host} сохраняет мир…` : `${s.host} открывает мир…`);
          await sleep(3000 * K);
          continue;
        }
        ui.status('Становлюсь хостом…');
        if (!(await acquireHost(cloud, c.worldId, me))) { await sleep(1500 * K); continue; }
        await runHost(p, cloud, me, ctl, hooks, ui);
        break;
      }
    } catch (e) {
      error = (e as Error).message;
      hooks.log(error, 'error');
    } finally {
      active = null;
      ui.status(null);
      ui.onDone(error);
    }
  })();
}

/** Ждём, пока процесс игры закроется */
function gameFinished(): Promise<number | null> {
  return new Promise(resolve => { pendingExit = resolve; });
}
let pendingExit: ((code: number | null) => void) | null = null;
function notifyExit(code: number | null) { const f = pendingExit; pendingExit = null; f?.(code); }

/** launchProfile + промис завершения игры (обёрнут в объект, чтобы await не ждал конца игры) */
async function launchAndKeep(p: Profile, hooks: LaunchHooks, ui: CloudUi, opts: LaunchOptions): Promise<{ finished: Promise<number | null> }> {
  const finished = gameFinished();
  await launchProfile(p, hooks, () => ui.onGameStart(), code => notifyExit(code), { ...opts, keepLauncher: true });
  return { finished };
}

async function runGuest(p: Profile, cloud: Cloud, s: Session, ctl: { stop: boolean }, hooks: LaunchHooks, ui: CloudUi): Promise<'exit' | 'host-changed'> {
  ui.status(`Подключаюсь к ${s.host}…`);
  hooks.log(`[Облако] хост ${s.host}, адрес ${s.address}`);
  let hostChanged = false;
  const { finished } = await launchAndKeep(p, hooks, ui, { quickPlayMultiplayer: s.address });
  ui.status(`Играешь у ${s.host}`);
  let done = false;
  finished.then(() => { done = true; });
  while (!done) {
    await Promise.race([finished, sleep(GUEST_CHECK_MS)]);
    if (done || ctl.stop) break;
    const now = await readSession(cloud, p.cloud!.worldId);
    const same = fresh(now) && now.hostId === s.hostId && now.state === 'open' && now.address === s.address;
    if (!same) {
      hostChanged = true;
      hooks.log('[Облако] хост вышел — переключаюсь', 'warn');
      killGame();
      await finished;
      break;
    }
  }
  if (hostChanged) return 'host-changed';
  if (ctl.stop) return 'exit';
  // игрок закрыл игру сам — но если как раз ушёл и хост, это смена хоста, а не выход
  const after = await readSession(cloud, p.cloud!.worldId);
  if (!fresh(after) || after.hostId !== s.hostId || after.state !== 'open') return 'host-changed';
  return 'exit';
}

async function runHost(p: Profile, cloud: Cloud, me: { id: string; name: string }, ctl: { stop: boolean; busy: boolean }, hooks: LaunchHooks, ui: CloudUi) {
  const c = p.cloud!;
  const dir = worldDir(p, c);
  let session: Session = { hostId: me.id, host: me.name, state: 'starting', beat: Date.now() };
  let lost = false;

  // «я жив» каждые 15 секунд; если кто-то перехватил хост — уступаем
  const beat = setInterval(async () => {
    try {
      const cur = await readSession(cloud, c.worldId);
      if (cur && cur.hostId !== me.id && fresh(cur)) {
        lost = true;
        hooks.log('[Облако] хост перехватил другой игрок', 'warn');
        return;
      }
      session = { ...session, beat: Date.now() };
      await cloud.writeJson(sessionPath(c.worldId), session);
    } catch { /* сеть моргнула — попробуем в следующий раз */ }
  }, BEAT_MS);

  try {
    ui.status('Скачиваю мир из облака…');
    const down = await syncDown(cloud, c.worldId, dir, cacheFile(p), (d, t) => hooks.progress({ stage: 'Скачиваю мир из облака', done: d, total: t }));
    await updateProfile(p.id, { cloudBaseVersion: down.version, cloudPendingUpload: false });
    hooks.progress(null);
    if (lost) throw new Error('Пока мир качался, хостом стал другой игрок — нажми «Играть» ещё раз');

    ui.status('Запускаю мир…');
    let address: string | undefined;
    const { finished } = await launchAndKeep(p, hooks, ui, {
      quickPlaySingleplayer: c.folder,
      extraJvm: ['-Dneon.autohost=true'],
      onLine: line => {
        const m = /Domain (?:re)?assigned: (\S+)/.exec(line);
        if (m && m[1] !== address) {
          address = m[1];
          session = { ...session, state: 'open', address, beat: Date.now() };
          cloud.writeJson(sessionPath(c.worldId), session).catch(() => undefined);
          hooks.log(`[Облако] мир открыт для друзей: ${address}`);
          ui.status('Ты хост — друзья подключаются сами');
        }
        if (line.includes('[NeonAutoHost] ERROR')) ui.status('Не удалось открыть мир для друзей — открой вручную: Esc → «Открыть для сети»');
      },
    });

    // автосохранение в облако во время игры
    let saving = false;
    const autosave = setInterval(async () => {
      if (saving || lost) return;
      saving = true;
      try {
        const r = await syncUp(cloud, c.worldId, dir, cacheFile(p), me.name, c.worldName, undefined, 5000);
        await updateProfile(p.id, { cloudBaseVersion: r.version });
        hooks.log(`[Облако] автосохранение: версия ${r.version}, файлов ${r.uploaded}`);
      } catch (e) {
        hooks.log(`[Облако] автосохранение не удалось: ${(e as Error).message}`, 'warn');
      } finally {
        saving = false;
      }
    }, AUTOSAVE_MS);

    // хост перехвачен (редкая гонка) — закрываем игру, ничего не заливаем
    const watchLost = setInterval(() => { if (lost) killGame(); }, 2000 * K);
    await finished;
    clearInterval(autosave);
    clearInterval(watchLost);
    while (saving) await sleep(500);
    if (lost) return;

    // финальное сохранение: остальные ждут, пока оно закончится
    ctl.busy = true;
    session = { ...session, state: 'saving', beat: Date.now() };
    await cloud.writeJson(sessionPath(c.worldId), session).catch(() => undefined);
    ui.status('Сохраняю мир в облако…');
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await syncUp(cloud, c.worldId, dir, cacheFile(p), me.name, c.worldName,
          (d, t) => hooks.progress({ stage: 'Сохраняю мир в облако', done: d, total: t }));
        await updateProfile(p.id, { cloudBaseVersion: r.version, cloudPendingUpload: false });
        hooks.log(`[Облако] мир сохранён (версия ${r.version})`);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e as Error;
        await sleep(3000 * K * (attempt + 1));
      }
    }
    if (lastErr) {
      await updateProfile(p.id, { cloudPendingUpload: true });
      throw new Error(`Мир не сохранился в облако (${lastErr.message}). Он цел у тебя — зальётся при следующем запуске.`);
    }
  } finally {
    clearInterval(beat);
    hooks.progress(null);
    ctl.busy = false;
    if (!lost) await cloud.remove(sessionPath(c.worldId)).catch(() => undefined);
  }
}

/** Догружаем мир, который не ушёл в облако в прошлый раз */
async function uploadPending(p: Profile, cloud: Cloud, me: { id: string; name: string }, hooks: LaunchHooks, ui: CloudUi) {
  const c = p.cloud!;
  const remote = await readManifest(cloud, c.worldId);
  const dir = worldDir(p, c);
  if (remote && p.cloudBaseVersion !== undefined && remote.v > p.cloudBaseVersion) {
    // пока нас не было, друзья играли дальше — их версия главнее, нашу сохраняем копией
    const backup = `${dir}-копия-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    await fsp.cp(dir, backup, { recursive: true }).catch(() => undefined);
    hooks.log(`[Облако] в облаке более новый мир; твоя несохранённая версия — в ${path.basename(backup)}`, 'warn');
    await updateProfile(p.id, { cloudPendingUpload: false });
    return;
  }
  if (fresh(await readSession(cloud, c.worldId))) return; // кто-то уже играет — догрузим позже
  ui.status('Догружаю несохранённый мир в облако…');
  const r = await syncUp(cloud, c.worldId, dir, cacheFile(p), me.name, c.worldName,
    (d, t) => hooks.progress({ stage: 'Догружаю мир в облако', done: d, total: t }));
  await updateProfile(p.id, { cloudBaseVersion: r.version, cloudPendingUpload: false });
  hooks.progress(null);
}

// ---------------- создание и подключение ----------------

export function newWorldId(): string {
  return crypto.randomBytes(8).toString('base64url');
}

/** Миры профиля, которые можно загрузить в облако */
export async function localWorlds(p: Profile): Promise<{ folder: string; lastPlayed: number }[]> {
  const saves = path.join(paths.profileDir(p.id), 'saves');
  const out: { folder: string; lastPlayed: number }[] = [];
  try {
    for (const d of await fsp.readdir(saves, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const level = path.join(saves, d.name, 'level.dat');
      const st = await fsp.stat(level).catch(() => null);
      if (st) out.push({ folder: d.name, lastPlayed: st.mtimeMs });
    }
  } catch { /* папки saves ещё нет */ }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

export async function uploadNewCloudWorld(
  p: Profile, token: string, folder: string, ownerName: string, hooks: LaunchHooks,
): Promise<CloudWorld> {
  if (p.loader !== 'fabric') throw new Error('Облачный мир работает только с Fabric');
  if (!cloudVersionOk(p.mcVersion)) throw new Error('Облачный мир работает на версиях 1.20 и новее');
  if (isRunning().running) throw new Error('Сначала закрой игру');
  const cloud = new YaDisk(token);
  const world: CloudWorld = { worldId: newWorldId(), token, folder, worldName: folder, owner: ownerName };
  const dir = worldDir(p, world);
  if (!fs.existsSync(path.join(dir, 'level.dat'))) throw new Error('Мир не найден');
  const r = await syncUp(cloud, world.worldId, dir, cacheFile(p), ownerName, folder,
    (d, t) => hooks.progress({ stage: 'Загружаю мир в облако', done: d, total: t }));
  hooks.progress(null);
  await updateProfile(p.id, { cloud: world, cloudBaseVersion: r.version, cloudPendingUpload: false });
  return world;
}
