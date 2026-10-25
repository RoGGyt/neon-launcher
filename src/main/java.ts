// Автоматическая установка Java от Mojang (та же, что ставит официальный лаунчер)
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { paths, osName, safeJoin } from './paths';
import { DownloadTask, downloadAll, fetchJsonCached, fetchJson } from './net';

const RUNTIME_INDEX = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

type RuntimeIndex = Record<string, Record<string, { manifest: { sha1: string; url: string }; version: { name: string } }[]>>;

interface RuntimeManifest {
  files: Record<string, {
    type: 'file' | 'directory' | 'link';
    executable?: boolean;
    target?: string;
    downloads?: { raw: { sha1: string; size: number; url: string } };
  }>;
}

function platformKey(): string {
  const a = process.arch;
  switch (osName()) {
    case 'windows': return a === 'ia32' ? 'windows-x86' : a === 'arm64' ? 'windows-arm64' : 'windows-x64';
    case 'osx': return a === 'arm64' ? 'mac-os-arm64' : 'mac-os';
    default: return a === 'ia32' ? 'linux-i386' : 'linux';
  }
}

function javaBin(home: string): string {
  if (osName() === 'windows') return path.join(home, 'bin', 'java.exe');
  if (osName() === 'osx') return path.join(home, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(home, 'bin', 'java');
}

/**
 * Возвращает путь к java нужной версии, скачивая рантайм при необходимости.
 * component: java-runtime-delta (21), java-runtime-gamma (17), java-runtime-alpha (16), jre-legacy (8) и т.д.
 */
export async function ensureJava(
  component: string,
  majorVersion: number,
  concurrency: number,
  onProgress: (done: number, total: number) => void,
): Promise<string> {
  const plat = platformKey();
  const home = path.join(paths.runtime, component, plat);
  const marker = path.join(home, '.neon-installed');

  const index = await fetchJsonCached<RuntimeIndex>(RUNTIME_INDEX, path.join(paths.cache, 'java-runtimes.json'), 24 * 3600_000);
  let entries = index[plat]?.[component];
  // на Apple Silicon старой Java нет — берём x64-сборку (запустится через Rosetta)
  if ((!entries || entries.length === 0) && plat === 'mac-os-arm64') entries = index['mac-os']?.[component];
  if (!entries || entries.length === 0) {
    throw new Error(`Mojang не даёт Java ${majorVersion} (${component}) для ${plat}. Укажи свою Java в настройках профиля.`);
  }
  const entry = entries[0];

  try {
    if ((await fsp.readFile(marker, 'utf8')).trim() === entry.manifest.sha1 && fs.existsSync(javaBin(home))) {
      return javaBin(home);
    }
  } catch { /* ещё не установлено */ }

  const manifest = await fetchJson<RuntimeManifest>(entry.manifest.url);
  const tasks: DownloadTask[] = [];
  const execs: string[] = [];
  const links: [string, string][] = [];
  for (const [rel, f] of Object.entries(manifest.files)) {
    const full = safeJoin(home, rel);
    if (f.type === 'directory') await fsp.mkdir(full, { recursive: true });
    else if (f.type === 'file' && f.downloads?.raw) {
      tasks.push({ url: f.downloads.raw.url, dest: full, sha1: f.downloads.raw.sha1, size: f.downloads.raw.size });
      if (f.executable) execs.push(full);
    } else if (f.type === 'link' && f.target) links.push([full, f.target]);
  }
  await downloadAll(tasks, concurrency, onProgress);

  if (osName() !== 'windows') {
    for (const e of execs) await fsp.chmod(e, 0o755);
    for (const [link, target] of links) {
      await fsp.rm(link, { force: true });
      await fsp.mkdir(path.dirname(link), { recursive: true });
      await fsp.symlink(target, link).catch(() => undefined);
    }
  }
  await fsp.writeFile(marker, entry.manifest.sha1);
  return javaBin(home);
}

/** Проверка пользовательской java: возвращает строку версии или кидает ошибку */
export function checkJava(javaPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(javaPath, ['-version'], { windowsHide: true });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (out += d));
    p.on('error', e => reject(new Error(`Не удалось запустить ${javaPath}: ${e.message}`)));
    p.on('close', code => (code === 0 ? resolve(out.split('\n')[0].trim()) : reject(new Error(out || `java завершилась с кодом ${code}`))));
  });
}
