// Минимальное NBT (несжатое, big-endian) — для servers.dat, списка серверов игры
import fsp from 'fs/promises';

const enum T { End = 0, Byte = 1, Short = 2, Int = 3, Long = 4, Float = 5, Double = 6, ByteArray = 7, String = 8, List = 9, Compound = 10, IntArray = 11, LongArray = 12 }

/** Значение NBT с сохранённым типом, чтобы записать файл обратно без потерь */
export type Tag =
  | { type: T.Byte | T.Short | T.Int | T.Float | T.Double; value: number }
  | { type: T.Long; value: bigint }
  | { type: T.String; value: string }
  | { type: T.ByteArray; value: Buffer }
  | { type: T.IntArray; value: number[] }
  | { type: T.LongArray; value: bigint[] }
  | { type: T.List; itemType: number; value: Tag[] }
  | { type: T.Compound; value: Map<string, Tag> };

class Reader {
  pos = 0;
  constructor(private b: Buffer) {}
  u8() { return this.b.readUInt8(this.pos++); }
  i8() { return this.b.readInt8(this.pos++); }
  i16() { const v = this.b.readInt16BE(this.pos); this.pos += 2; return v; }
  u16() { const v = this.b.readUInt16BE(this.pos); this.pos += 2; return v; }
  i32() { const v = this.b.readInt32BE(this.pos); this.pos += 4; return v; }
  i64() { const v = this.b.readBigInt64BE(this.pos); this.pos += 8; return v; }
  f32() { const v = this.b.readFloatBE(this.pos); this.pos += 4; return v; }
  f64() { const v = this.b.readDoubleBE(this.pos); this.pos += 8; return v; }
  str() { const n = this.u16(); const s = this.b.toString('utf8', this.pos, this.pos + n); this.pos += n; return s; }

  payload(type: number): Tag {
    switch (type) {
      case T.Byte: return { type, value: this.i8() };
      case T.Short: return { type, value: this.i16() };
      case T.Int: return { type, value: this.i32() };
      case T.Long: return { type, value: this.i64() };
      case T.Float: return { type, value: this.f32() };
      case T.Double: return { type, value: this.f64() };
      case T.ByteArray: { const n = this.i32(); const v = Buffer.from(this.b.subarray(this.pos, this.pos + n)); this.pos += n; return { type, value: v }; }
      case T.String: return { type, value: this.str() };
      case T.List: {
        const itemType = this.u8(); const n = this.i32(); const value: Tag[] = [];
        for (let i = 0; i < n; i++) value.push(this.payload(itemType));
        return { type, itemType, value };
      }
      case T.Compound: {
        const value = new Map<string, Tag>();
        for (;;) {
          const t = this.u8();
          if (t === T.End) break;
          value.set(this.str(), this.payload(t));
        }
        return { type, value };
      }
      case T.IntArray: { const n = this.i32(); const v: number[] = []; for (let i = 0; i < n; i++) v.push(this.i32()); return { type, value: v }; }
      case T.LongArray: { const n = this.i32(); const v: bigint[] = []; for (let i = 0; i < n; i++) v.push(this.i64()); return { type, value: v }; }
      default: throw new Error(`Неизвестный NBT-тег ${type}`);
    }
  }
}

class Writer {
  parts: Buffer[] = [];
  push(b: Buffer) { this.parts.push(b); }
  num(size: number, fn: (b: Buffer) => void) { const b = Buffer.alloc(size); fn(b); this.push(b); }
  str(s: string) { const d = Buffer.from(s, 'utf8'); this.num(2, b => b.writeUInt16BE(d.length)); this.push(d); }

  payload(t: Tag) {
    switch (t.type) {
      case T.Byte: return this.num(1, b => b.writeInt8(t.value));
      case T.Short: return this.num(2, b => b.writeInt16BE(t.value));
      case T.Int: return this.num(4, b => b.writeInt32BE(t.value));
      case T.Long: return this.num(8, b => b.writeBigInt64BE(t.value));
      case T.Float: return this.num(4, b => b.writeFloatBE(t.value));
      case T.Double: return this.num(8, b => b.writeDoubleBE(t.value));
      case T.ByteArray: this.num(4, b => b.writeInt32BE(t.value.length)); return this.push(t.value);
      case T.String: return this.str(t.value);
      case T.List:
        this.num(1, b => b.writeUInt8(t.value.length ? t.value[0].type : t.itemType));
        this.num(4, b => b.writeInt32BE(t.value.length));
        for (const it of t.value) this.payload(it);
        return;
      case T.Compound:
        for (const [k, v] of t.value) { this.num(1, b => b.writeUInt8(v.type)); this.str(k); this.payload(v); }
        return this.num(1, b => b.writeUInt8(T.End));
      case T.IntArray: this.num(4, b => b.writeInt32BE(t.value.length)); for (const v of t.value) this.num(4, b => b.writeInt32BE(v)); return;
      case T.LongArray: this.num(4, b => b.writeInt32BE(t.value.length)); for (const v of t.value) this.num(8, b => b.writeBigInt64BE(v)); return;
    }
  }
}

export function readNbt(buf: Buffer): { name: string; root: Extract<Tag, { type: T.Compound }> } {
  const r = new Reader(buf);
  if (r.u8() !== T.Compound) throw new Error('Корень NBT не compound');
  const name = r.str();
  return { name, root: r.payload(T.Compound) as Extract<Tag, { type: T.Compound }> };
}

export function writeNbt(name: string, root: Extract<Tag, { type: T.Compound }>): Buffer {
  const w = new Writer();
  w.num(1, b => b.writeUInt8(T.Compound));
  w.str(name);
  w.payload(root);
  return Buffer.concat(w.parts);
}

/** Добавляет сервер в servers.dat (в начало списка), если такого адреса там ещё нет */
export async function addServerToList(file: string, name: string, ip: string): Promise<boolean> {
  let doc: ReturnType<typeof readNbt>;
  try {
    doc = readNbt(await fsp.readFile(file));
  } catch {
    doc = { name: '', root: { type: T.Compound, value: new Map() } };
  }
  let list = doc.root.value.get('servers');
  if (!list || list.type !== T.List) {
    list = { type: T.List, itemType: T.Compound, value: [] };
    doc.root.value.set('servers', list);
  }
  const norm = (s: string) => s.trim().toLowerCase().replace(/:25565$/, '');
  const exists = list.value.some(s => {
    if (s.type !== T.Compound) return false;
    const v = s.value.get('ip');
    return v?.type === T.String && norm(v.value) === norm(ip);
  });
  if (exists) return false;
  list.value.unshift({
    type: T.Compound,
    value: new Map<string, Tag>([
      ['name', { type: T.String, value: name }],
      ['ip', { type: T.String, value: ip }],
      ['acceptTextures', { type: T.Byte, value: 1 }],
    ]),
  });
  await fsp.writeFile(file, writeNbt(doc.name, doc.root));
  return true;
}
