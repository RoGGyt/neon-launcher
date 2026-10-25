// Минимальный читатель ZIP/JAR без зависимостей (stored + deflate).
// Нужен для распаковки нативных библиотек старых версий Minecraft.
import fsp from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { safeJoin } from './paths';

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

export class ZipFile {
  private constructor(private buf: Buffer, readonly entries: ZipEntry[]) {}

  static async open(file: string): Promise<ZipFile> {
    const buf = await fsp.readFile(file);
    // ищем End Of Central Directory с конца файла
    const minPos = Math.max(0, buf.length - 0xffff - 22);
    let eocd = -1;
    for (let i = buf.length - 22; i >= minPos; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(`Не ZIP-архив: ${path.basename(file)}`);
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const entries: ZipEntry[] = [];
    for (let i = 0; i < count; i++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Повреждённый ZIP (central directory)');
      const method = buf.readUInt16LE(p + 10);
      const compressedSize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      entries.push({ name, method, compressedSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return new ZipFile(buf, entries);
  }

  read(entry: ZipEntry): Buffer {
    const p = entry.localOffset;
    if (this.buf.readUInt32LE(p) !== 0x04034b50) throw new Error('Повреждённый ZIP (local header)');
    const nameLen = this.buf.readUInt16LE(p + 26);
    const extraLen = this.buf.readUInt16LE(p + 28);
    const start = p + 30 + nameLen + extraLen;
    const data = this.buf.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return Buffer.from(data);
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`Неподдерживаемое сжатие ${entry.method} в ${entry.name}`);
  }

  readText(name: string): string | null {
    const e = this.entries.find(x => x.name === name);
    return e ? this.read(e).toString('utf8') : null;
  }

  /** Распаковать файлы, для которых filter вернул true */
  async extractTo(destDir: string, filter: (name: string) => boolean): Promise<number> {
    let n = 0;
    for (const e of this.entries) {
      if (e.name.endsWith('/') || !filter(e.name)) continue;
      const out = safeJoin(destDir, e.name);
      await fsp.mkdir(path.dirname(out), { recursive: true });
      await fsp.writeFile(out, this.read(e));
      n++;
    }
    return n;
  }
}
