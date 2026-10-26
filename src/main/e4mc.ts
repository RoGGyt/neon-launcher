// e4all (открыть мир друзьям через интернет) при первом запуске скачивает нативную библиотеку QUIC
// с natives.e4mc.link. Из России этот адрес часто недоступен — тогда в игре «Failed to load native library».
// Лаунчер везёт эти библиотеки с собой и подсказывает моду путь через -Dlink.e4mc.native_path.
import fsp from 'fs/promises';
import path from 'path';
import { paths } from './paths';
import { resourceFile } from './resources';
import { ZipFile } from './zip';
import type { Profile } from '../shared/types';

/** Все строки (CONSTANT_Utf8) из пула констант class-файла */
export function classStrings(buf: Buffer): string[] {
  const out: string[] = [];
  if (buf.readUInt32BE(0) !== 0xcafebabe) return out;
  const count = buf.readUInt16BE(8);
  let o = 10;
  for (let i = 1; i < count; i++) {
    const tag = buf[o++];
    switch (tag) {
      case 1: { const len = buf.readUInt16BE(o); out.push(buf.toString('utf8', o + 2, o + 2 + len)); o += 2 + len; break; }
      case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18: o += 4; break;
      case 5: case 6: o += 8; i++; break;
      case 7: case 8: case 16: case 19: case 20: o += 2; break;
      case 15: o += 3; break;
      default: return out; // неизвестный тег — дальше разбирать нельзя
    }
  }
  return out;
}

/** Нативные библиотеки e4all: где мод их ищет и каким свойством ему подсказать готовый файл */
export const E4MC_NATIVES = [
  { cls: 'io/netty/incubator/codec/quic/Quiche.class', prop: 'link.e4mc.native_path', base: 'netty_quiche' },
  { cls: 'link/e4mc/iroh/Native.class', prop: 'link.e4mc.dialtone.native_path', base: 'iroh_java' },
];

/** Имя файла для этой платформы из таблицы хэшей внутри класса, например iroh_java_windows_x86_64_b296210.dll */
export function nativeFileName(classBytes: Buffer, base: string, platform = process.platform, arch = process.arch): string | null {
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux';
  const a = arch === 'arm64' ? 'aarch_64' : arch === 'x64' ? 'x86_64' : null;
  if (!a) return null;
  const ext = platform === 'win32' ? 'dll' : platform === 'darwin' ? 'dylib' : 'so';
  const re = new RegExp(`^(lib)?${base}_${os}_${a}_[0-9a-z]+\\.${ext}$`);
  return classStrings(classBytes).find(s => re.test(s)) ?? null;
}

/** JVM-аргументы с путями к нативкам e4all, которые лаунчер везёт с собой */
export async function e4mcNativeArgs(p: Profile): Promise<string[]> {
  const out: string[] = [];
  try {
    const mods = path.join(paths.profileDir(p.id), 'mods');
    const jar = (await fsp.readdir(mods)).find(f => /e4all|e4mc/i.test(f) && f.endsWith('.jar'));
    if (!jar) return out;
    const zip = await ZipFile.open(path.join(mods, jar));
    for (const n of E4MC_NATIVES) {
      const entry = zip.entries.find(e => e.name === n.cls);
      if (!entry) continue;
      const name = nativeFileName(zip.read(entry), n.base);
      const file = name && resourceFile(path.join('e4mc', name));
      if (file) out.push(`-D${n.prop}=${file}`);
    }
  } catch {
    /* нет модов или битый jar — e4all попробует скачать сам */
  }
  return out;
}
