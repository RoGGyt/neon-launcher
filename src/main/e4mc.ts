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

/** Имя библиотеки, которую ждёт этот e4all, например netty_quiche_windows_x86_64_74.dll */
export function quicheLibName(classBytes: Buffer, platform = process.platform, arch = process.arch): string | null {
  const strings = classStrings(classBytes);
  if (!strings.includes('netty_quiche')) return null;
  const suffix = strings.find(s => /^_\d+$/.test(s));
  if (!suffix) return null;
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux';
  const a = arch === 'arm64' ? 'aarch_64' : arch === 'x64' ? 'x86_64' : null;
  if (!a) return null;
  const base = `netty_quiche_${os}_${a}${suffix}`;
  return platform === 'win32' ? `${base}.dll` : platform === 'darwin' ? `lib${base}.dylib` : `lib${base}.so`;
}

/** Путь к нативной библиотеке QUIC для e4all из профиля, если она есть в лаунчере */
export async function e4mcNativePath(p: Profile): Promise<string | null> {
  try {
    const mods = path.join(paths.profileDir(p.id), 'mods');
    const jar = (await fsp.readdir(mods)).find(f => /e4all|e4mc/i.test(f) && f.endsWith('.jar'));
    if (!jar) return null;
    const zip = await ZipFile.open(path.join(mods, jar));
    const entry = zip.entries.find(e => e.name === 'io/netty/incubator/codec/quic/Quiche.class');
    if (!entry) return null;
    const lib = quicheLibName(zip.read(entry));
    return lib ? resourceFile(path.join('e4mc', lib)) : null;
  } catch {
    return null;
  }
}
