// Подготовка профиля (скачивание всего нужного) и запуск игры
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { paths } from './paths';
import { downloadAll, DownloadTask } from './net';
import {
  Argument, Features, ResolvedVersion, ensureVersionJson, resolveVersion, planLibraries,
  extractNatives, installAssets, clientJarTask, loggingTask, jarOwnerJson, rulesAllow,
} from './mojang';
import { ensureJava, checkJava } from './java';
import { installFabric, installForge } from './loaders';
import { elyEnsureValid, ensureAuthlibInjector } from './auth';
import { getSettings, saveSettings, updateProfile } from './store';
import { addServerToList } from './nbt';
import { e4mcNativePath } from './e4mc';
import { neonMenuJar, hiddenFabric, hiddenFabricApi } from './neonmenu';
import type { Account, Profile, ProgressEvent, LogEvent } from '../shared/types';

export interface LaunchHooks {
  progress(e: ProgressEvent | null): void;
  log(line: string, level?: LogEvent['level']): void;
}

const LAUNCHER_NAME = 'neon-launcher';
const LAUNCHER_VERSION = '1.0.0';

/** Простое разбиение строки JVM-аргументов с учётом кавычек */
export function splitArgs(s: string | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let has = false;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += ch;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

/** "play.example.com:25566" -> { host, port } */
export function parseAddress(addr: string): { host: string; port: number } | null {
  const a = addr.trim();
  if (!a || /\s/.test(a)) return null;
  let host = a;
  let portStr: string | undefined;
  const v6 = /^\[(.+)\](?::(\d+))?$/.exec(a);
  if (v6) {
    host = v6[1];
    portStr = v6[2];
  } else if ((a.match(/:/g) ?? []).length === 1) {
    [host, portStr] = a.split(':');
  }
  const port = portStr ? Number(portStr) : 25565;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function substitute(arg: string, vars: Record<string, string>): string {
  return arg.replace(/\$\{([^}]+)\}/g, (all, key: string) => (key in vars ? vars[key] : all));
}

function processArgs(list: Argument[] | undefined, vars: Record<string, string>, features: Features): string[] {
  const out: string[] = [];
  for (const a of list ?? []) {
    if (typeof a === 'string') out.push(substitute(a, vars));
    else if (rulesAllow(a.rules, features)) {
      for (const v of Array.isArray(a.value) ? a.value : [a.value]) out.push(substitute(v, vars));
    }
  }
  return out;
}

interface Prepared {
  /** jar-файлы, которые подключаются без папки mods (Neon Client и при необходимости Fabric API) */
  addMods?: string[];
  version: ResolvedVersion;
  java: string;
  classpath: string[];
  nativesDir: string;
  assetsIndex: string;
  legacyAssetsDir: string | null;
  loggingArg: string | null;
}

/** Определяет java для версии: своя из профиля или автоматическая от Mojang */
async function javaFor(profile: Profile, base: { javaVersion?: { component: string; majorVersion: number } }, hooks: LaunchHooks, concurrency: number): Promise<string> {
  if (profile.javaPath) {
    const v = await checkJava(profile.javaPath);
    hooks.log(`Своя Java: ${v}`);
    return profile.javaPath;
  }
  const component = base.javaVersion?.component ?? 'jre-legacy';
  const major = base.javaVersion?.majorVersion ?? 8;
  hooks.log(`Проверяю Java ${major} (${component})…`);
  return ensureJava(component, major, concurrency, (done, total) =>
    hooks.progress({ stage: `Java ${major}`, done, total }));
}

async function prepare(profile: Profile, hooks: LaunchHooks): Promise<Prepared> {
  const concurrency = getSettings().parallelDownloads || 16;
  const gameDir = paths.profileDir(profile.id);
  await fsp.mkdir(gameDir, { recursive: true });

  hooks.progress({ stage: 'Получаю данные версии', done: 0, total: 1 });
  const base = await ensureVersionJson(profile.mcVersion);
  const java = await javaFor(profile, base, hooks, concurrency);

  // модлоадер
  let versionId = profile.installedVersionId;
  if (!versionId || !fs.existsSync(paths.versionJson(versionId))) {
    if (profile.loader === 'vanilla') versionId = profile.mcVersion;
    else if (!profile.loaderVersion) throw new Error('В профиле не выбрана версия модлоадера');
    else if (profile.loader === 'fabric') {
      hooks.progress({ stage: 'Устанавливаю Fabric', done: 0, total: 1 });
      hooks.log(`Устанавливаю Fabric ${profile.loaderVersion}…`);
      versionId = await installFabric(profile.mcVersion, profile.loaderVersion);
    } else {
      // установщику Forge нужна ванильная версия на месте
      const vanilla = await resolveVersion(profile.mcVersion);
      const jar = clientJarTask(vanilla, base);
      if (jar) await downloadAll([jar], 1, () => undefined);
      hooks.progress({ stage: 'Устанавливаю Forge', done: 0, total: 1 });
      versionId = await installForge(profile.mcVersion, profile.loaderVersion, async () => java, l => hooks.log(l));
    }
    await updateProfile(profile.id, { installedVersionId: versionId });
  }

  // меню Neon на ванильном профиле: незаметно запускаем через Fabric
  const menuJar = neonMenuJar(profile);
  const addMods: string[] = [];
  if (menuJar) {
    if (profile.loader === 'vanilla') versionId = await hiddenFabric(profile.mcVersion, l => hooks.log(l));
    addMods.push(menuJar);
    const api = await hiddenFabricApi(profile, l => hooks.log(l));
    if (api) addMods.push(api);
  }

  let version = await resolveVersion(versionId!);
  const features: Features = { has_custom_resolution: Boolean(profile.width && profile.height) };
  let plan = planLibraries(version, features);

  // Forge генерирует часть файлов сам; если их нет — переустанавливаем
  if (profile.loader === 'forge' && plan.mustExist.some(f => !fs.existsSync(f))) {
    hooks.log('Файлы Forge повреждены или не до конца установлены — переустанавливаю…', 'warn');
    await fsp.rm(paths.versionDir(versionId!), { recursive: true, force: true });
    versionId = await installForge(profile.mcVersion, profile.loaderVersion!, async () => java, l => hooks.log(l));
    version = await resolveVersion(versionId);
    plan = planLibraries(version, features);
  }

  // библиотеки + клиент + конфиг логов
  const tasks: DownloadTask[] = [...plan.downloads];
  const jar = clientJarTask(version, await jarOwnerJson(version));
  if (jar) tasks.push(jar);
  const logging = loggingTask(version);
  if (logging) tasks.push(logging.task);
  await downloadAll(tasks, concurrency, (done, total) => hooks.progress({ stage: 'Библиотеки', done, total }));

  const missing = plan.mustExist.filter(f => !fs.existsSync(f));
  if (missing.length) throw new Error(`Не хватает файлов:\n${missing.slice(0, 3).join('\n')}`);

  hooks.progress({ stage: 'Распаковываю нативные библиотеки', done: 0, total: 1 });
  const nativesDir = await extractNatives(version, plan);

  const assets = await installAssets(version, gameDir, concurrency, (done, total) =>
    hooks.progress({ stage: 'Ресурсы игры', done, total }));

  const classpath = [...plan.classpath];
  const clientJar = paths.versionJar(version.jarId);
  if (fs.existsSync(clientJar) && !classpath.includes(clientJar)) classpath.push(clientJar);

  return { addMods, version, java, classpath, nativesDir, assetsIndex: assets.indexId, legacyAssetsDir: assets.legacyDir, loggingArg: logging?.argument ?? null };
}

async function resolveAccount(hooks: LaunchHooks): Promise<Account> {
  const s = getSettings();
  if (!s.account) throw new Error('Сначала введи ник на главной или войди через Ely.by в настройках');
  if (s.account.type === 'ely') {
    const fresh = await elyEnsureValid(s.account);
    if (fresh !== s.account) {
      await saveSettings({ account: fresh });
      hooks.log('Токен Ely.by обновлён');
    }
    return fresh;
  }
  return s.account;
}

export interface LaunchOptions {
  /** сразу открыть одиночный мир (имя папки в saves) — для хоста облачного мира */
  quickPlaySingleplayer?: string;
  /** сразу зайти на этот адрес — для гостя облачного мира */
  quickPlayMultiplayer?: string;
  extraJvm?: string[];
  /** каждая строка лога игры */
  onLine?: (line: string) => void;
  /** не закрывать лаунчер после запуска (облачному миру он нужен для синхронизации) */
  keepLauncher?: boolean;
}

export function buildCommand(profile: Profile, prep: Prepared, account: Account, authlib: string | null, opts: LaunchOptions = {}): string[] {
  const v = prep.version;
  const gameDir = paths.profileDir(profile.id);
  const join = opts.quickPlayMultiplayer
    ? parseAddress(opts.quickPlayMultiplayer)
    : !opts.quickPlaySingleplayer && profile.autoJoin && profile.serverAddress ? parseAddress(profile.serverAddress) : null;
  const features: Features = {
    has_custom_resolution: Boolean(profile.width && profile.height),
    is_quick_play_multiplayer: Boolean(join),
    is_quick_play_singleplayer: Boolean(opts.quickPlaySingleplayer),
  };
  const uuidNoDash = account.uuid.replace(/-/g, '');
  const token = account.type === 'ely' ? account.accessToken : '0';
  const vars: Record<string, string> = {
    auth_player_name: account.name,
    version_name: v.id,
    game_directory: gameDir,
    assets_root: paths.assets,
    assets_index_name: prep.assetsIndex,
    game_assets: prep.legacyAssetsDir ?? paths.assets,
    auth_uuid: uuidNoDash,
    auth_access_token: token,
    auth_session: account.type === 'ely' ? `token:${token}:${uuidNoDash}` : '-',
    auth_xuid: '0',
    clientid: '0',
    user_type: account.type === 'ely' ? 'mojang' : 'legacy',
    user_properties: '{}',
    version_type: v.type ?? 'release',
    natives_directory: prep.nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath: prep.classpath.join(path.delimiter),
    classpath_separator: path.delimiter,
    library_directory: paths.libraries,
    resolution_width: String(profile.width ?? 854),
    resolution_height: String(profile.height ?? 480),
    quick_play_multiplayer: join ? `${join.host}:${join.port}` : '',
    quick_play_singleplayer: opts.quickPlaySingleplayer ?? '',
  };
  // в новых версиях (1.21.x) Mojang пишет переменные быстрого входа в camelCase
  vars.quickPlayMultiplayer = vars.quick_play_multiplayer;
  vars.quickPlaySingleplayer = vars.quick_play_singleplayer;

  const jvm: string[] = [
    `-Xmx${profile.ramMb}m`,
    `-Xms${Math.min(1024, profile.ramMb)}m`,
    '-XX:+UseG1GC',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:G1NewSizePercent=20',
    '-XX:G1ReservePercent=20',
    '-XX:MaxGCPauseMillis=50',
    '-Dfile.encoding=UTF-8',
  ];
  // нативные библиотеки LWJGL/JNA/Netty распаковываются в папку версии, а не в %TEMP% —
  // чтобы после удаления лаунчера в системе ничего не оставалось
  jvm.push(
    `-Dorg.lwjgl.system.SharedLibraryExtractPath=${prep.nativesDir}`,
    `-Djna.tmpdir=${prep.nativesDir}`,
    `-Dio.netty.native.workdir=${prep.nativesDir}`,
  );
  if (authlib) jvm.push(`-javaagent:${authlib}=ely.by`);
  jvm.push(...splitArgs(profile.jvmArgs));
  jvm.push(...(opts.extraJvm ?? []));
  if (prep.addMods?.length) jvm.push(`-Dfabric.addMods=${prep.addMods.join(path.delimiter)}`);
  if (prep.loggingArg) jvm.push(prep.loggingArg);

  const versionJvm = processArgs(v.arguments?.jvm, vars, features);
  if (!versionJvm.includes('-cp') && !versionJvm.includes('-classpath')) {
    versionJvm.unshift(`-Djava.library.path=${prep.nativesDir}`, '-cp', vars.classpath);
  }
  jvm.push(...versionJvm);

  let game = processArgs(v.arguments?.game, vars, features);
  if (game.length === 0 && v.minecraftArguments) {
    game = splitArgs(v.minecraftArguments).map(a => substitute(a, vars));
  }
  if (features.has_custom_resolution && !game.includes('--width')) {
    game.push('--width', vars.resolution_width, '--height', vars.resolution_height);
  }
  // сразу на сервер: в 1.20+ через quickPlay, в старых версиях через --server/--port
  if (join && !game.includes('--quickPlayMultiplayer')) {
    game.push('--server', join.host, '--port', String(join.port));
  }
  if (opts.quickPlaySingleplayer && !game.includes('--quickPlaySingleplayer')) {
    throw new Error('Эта версия игры не умеет сразу открывать мир — облачные миры работают на 1.20 и новее');
  }
  return [...jvm, v.mainClass, ...game];
}

// ---------- процесс игры ----------

let game: ChildProcess | null = null;
let gameProfile: string | null = null;

export function isRunning() {
  return { running: game !== null, profileId: gameProfile };
}

export function killGame() {
  game?.kill();
}

export async function launchProfile(
  profile: Profile,
  hooks: LaunchHooks,
  onStart: () => void,
  onExit: (code: number | null) => void,
  opts: LaunchOptions = {},
): Promise<void> {
  if (game) throw new Error('Игра уже запущена');
  const account = await resolveAccount(hooks);
  hooks.log(`Запуск профиля «${profile.name}» (${profile.loader} ${profile.mcVersion}) от имени ${account.name}`);

  const prep = await prepare(profile, hooks);
  const authlib = account.type === 'ely' ? await ensureAuthlibInjector() : null;
  const quic = await e4mcNativePath(profile);
  if (quic) hooks.log(`e4all: нативная библиотека из лаунчера (${path.basename(quic)})`);
  const args = buildCommand(profile, prep, account, authlib, {
    ...opts,
    extraJvm: [...(opts.extraJvm ?? []), ...(quic ? [`-Dlink.e4mc.native_path=${quic}`] : [])],
  });

  // сервер из профиля появляется в «Сетевой игре»
  if (profile.serverAddress?.trim()) {
    await addServerToList(path.join(paths.profileDir(profile.id), 'servers.dat'), profile.serverName?.trim() || profile.name, profile.serverAddress.trim())
      .catch(e => hooks.log(`Не удалось добавить сервер в список: ${(e as Error).message}`, 'warn'));
  }

  hooks.progress({ stage: 'Запускаю игру', done: 1, total: 1 });
  const shown = args.map(a => {
    if (account.type === 'ely' && a.includes(account.accessToken)) return '***';
    return a.length > 300 ? '[classpath]' : a;
  });
  hooks.log(`${prep.java} ${shown.join(' ')}`);

  const afterLaunch = opts.keepLauncher && getSettings().afterLaunch === 'close' ? 'hide' : getSettings().afterLaunch;
  const child = spawn(prep.java, args, {
    cwd: paths.profileDir(profile.id),
    windowsHide: true,
    detached: afterLaunch === 'close',
    stdio: afterLaunch === 'close' ? 'ignore' : 'pipe',
  });
  game = child;
  gameProfile = profile.id;

  // подписываемся сразу: событие 'spawn' приходит на следующем тике, до любого await
  const spawned = new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve());
    child.once('error', e => {
      game = null;
      gameProfile = null;
      reject(new Error(`Не удалось запустить Java: ${e.message}`));
    });
  });
  let started = false;
  let exitCode: number | null | undefined;
  child.once('exit', code => {
    game = null;
    gameProfile = null;
    if (code !== 0 && code !== null) hooks.log(`Игра завершилась с кодом ${code}`, 'error');
    else hooks.log('Игра закрыта');
    if (started) onExit(code);
    else exitCode = code;
  });

  // куски вывода могут рвать строку посередине — собираем целые строки
  const onData = (level: LogEvent['level']) => {
    let rest = '';
    return (d: Buffer) => {
      const parts = (rest + d.toString()).split(/\r?\n/);
      rest = parts.pop() ?? '';
      for (const line of parts) {
        if (!line) continue;
        const lvl = /\bERROR\b|Exception|FATAL/.test(line) ? 'error' : /\bWARN\b/.test(line) ? 'warn' : level;
        hooks.log(line, lvl);
        opts.onLine?.(line);
      }
    };
  };
  child.stdout?.on('data', onData('game'));
  child.stderr?.on('data', onData('game'));

  await spawned;
  await updateProfile(profile.id, { lastPlayed: Date.now() }).catch(() => undefined);

  hooks.progress(null);
  started = true;
  onStart();
  // игра успела закрыться, пока мы обновляли профиль
  if (exitCode !== undefined) onExit(exitCode);
  if (afterLaunch === 'close') child.unref();
}
