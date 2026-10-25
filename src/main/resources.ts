// Файлы, которые лаунчер везёт с собой (моды-помощники, Neon Client)
import fs from 'fs';
import path from 'path';

let resourcesDir = '';

export function setResourcesDir(dir: string) {
  resourcesDir = dir;
}

export function resourceFile(name: string): string | null {
  for (const dir of [resourcesDir, path.join(__dirname, '..', '..', 'resources')]) {
    const f = dir && path.join(dir, name);
    if (f && fs.existsSync(f)) return f;
  }
  return null;
}
