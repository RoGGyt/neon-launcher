// Настройки и профили в JSON-файлах
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { paths } from './paths';
import type { Profile, Settings, Loader } from '../shared/types';

const PROFILE_COLORS = ['#00f0ff', '#ff2bd6', '#9dff00', '#ffb800', '#8a5cff', '#ff4d4d'];

function defaultRam(): number {
  const total = Math.floor(os.totalmem() / 1024 / 1024);
  // половина памяти, но от 2 до 6 ГБ
  return Math.max(2048, Math.min(6144, Math.floor(total / 2 / 512) * 512));
}

export function defaultSettings(): Settings {
  return {
    nickname: '',
    account: null,
    selectedProfileId: null,
    defaultRamMb: defaultRam(),
    showSnapshots: false,
    showOld: false,
    afterLaunch: 'hide',
    parallelDownloads: 16,
  };
}

async function writeJsonAtomic(file: string, data: unknown) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// ---------- настройки ----------

let settings: Settings | null = null;

export function getSettings(): Settings {
  if (!settings) settings = { ...defaultSettings(), ...readJson<Partial<Settings>>(paths.settingsFile, {}) };
  return settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  settings = { ...getSettings(), ...patch };
  await writeJsonAtomic(paths.settingsFile, settings);
  return settings;
}

// ---------- профили ----------

let profiles: Profile[] | null = null;

export function listProfiles(): Profile[] {
  if (!profiles) profiles = readJson<Profile[]>(paths.profilesFile, []);
  return profiles;
}

export function getProfile(id: string): Profile {
  const p = listProfiles().find(x => x.id === id);
  if (!p) throw new Error('Профиль не найден');
  return p;
}

export async function saveProfile(input: Partial<Profile> & { name: string; mcVersion: string; loader: Loader }): Promise<Profile> {
  const list = listProfiles();
  const existing = input.id ? list.find(p => p.id === input.id) : undefined;
  let profile: Profile;
  if (existing) {
    const versionChanged = existing.mcVersion !== input.mcVersion || existing.loader !== input.loader || existing.loaderVersion !== input.loaderVersion;
    profile = { ...existing, ...input, id: existing.id };
    if (versionChanged) profile.installedVersionId = undefined;
    list[list.indexOf(existing)] = profile;
  } else {
    profile = {
      id: crypto.randomUUID().slice(0, 8),
      ramMb: getSettings().defaultRamMb,
      color: PROFILE_COLORS[list.length % PROFILE_COLORS.length],
      createdAt: Date.now(),
      ...input,
    } as Profile;
    list.push(profile);
  }
  if (profile.name.trim() === '') profile.name = `${profile.loader === 'vanilla' ? '' : profile.loader + ' '}${profile.mcVersion}`.trim();
  await fsp.mkdir(paths.profileDir(profile.id), { recursive: true });
  await writeJsonAtomic(paths.profilesFile, list);
  return profile;
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  const list = listProfiles();
  const i = list.findIndex(p => p.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  await writeJsonAtomic(paths.profilesFile, list);
}

export async function deleteProfile(id: string, deleteFiles: boolean): Promise<void> {
  profiles = listProfiles().filter(p => p.id !== id);
  await writeJsonAtomic(paths.profilesFile, profiles);
  if (deleteFiles) await fsp.rm(paths.profileDir(id), { recursive: true, force: true });
  if (getSettings().selectedProfileId === id) await saveSettings({ selectedProfileId: profiles[0]?.id ?? null });
}
