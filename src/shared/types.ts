// Общие типы для main-процесса и интерфейса

export type Loader = 'vanilla' | 'fabric' | 'forge';
export type VersionKind = 'release' | 'snapshot' | 'old_beta' | 'old_alpha';

export interface McVersion {
  id: string;
  type: VersionKind;
  releaseTime: string;
  installed: boolean;
}

export interface LoaderVersion {
  id: string;
  stable: boolean;
  recommended?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  mcVersion: string;
  loader: Loader;
  loaderVersion?: string;
  /** id установленной версии в versions/ (например 1.20.1-forge-47.2.0) */
  installedVersionId?: string;
  ramMb: number;
  javaPath?: string;
  jvmArgs?: string;
  width?: number;
  height?: number;
  color: string;
  createdAt: number;
  lastPlayed?: number;
}

export type Account =
  | { type: 'offline'; name: string; uuid: string }
  | { type: 'ely'; name: string; uuid: string; accessToken: string; clientToken: string; login: string };

export interface Settings {
  nickname: string;
  account: Account | null;
  selectedProfileId: string | null;
  defaultRamMb: number;
  showSnapshots: boolean;
  showOld: boolean;
  afterLaunch: 'keep' | 'hide' | 'close';
  parallelDownloads: number;
}

export interface ProgressEvent {
  stage: string;
  done: number;
  total: number;
  /** доля 0..1, если известна */
  ratio?: number;
}

export interface LogEvent {
  line: string;
  level: 'info' | 'warn' | 'error' | 'game';
}

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  author: string;
  categories: string[];
}

export interface InstalledMod {
  fileName: string;
  enabled: boolean;
  title: string;
  projectId?: string;
  iconUrl?: string | null;
  versionNumber?: string;
  sizeBytes: number;
}

export interface SystemInfo {
  totalMemMb: number;
  platform: string;
  rootDir: string;
}

export interface LaunchState {
  running: boolean;
  profileId: string | null;
}

/** API, которое preload выдаёт в окно */
export interface LauncherApi {
  getSystemInfo(): Promise<SystemInfo>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;

  listVersions(force?: boolean): Promise<McVersion[]>;
  listLoaderVersions(loader: Loader, mcVersion: string): Promise<LoaderVersion[]>;

  listProfiles(): Promise<Profile[]>;
  saveProfile(p: Partial<Profile> & { name: string; mcVersion: string; loader: Loader }): Promise<Profile>;
  deleteProfile(id: string, deleteFiles: boolean): Promise<void>;
  openProfileFolder(id: string): Promise<void>;
  openRootFolder(): Promise<void>;

  loginOffline(name: string): Promise<Account>;
  loginEly(login: string, password: string, totp?: string): Promise<Account>;
  logout(): Promise<void>;

  launch(profileId: string): Promise<void>;
  killGame(): Promise<void>;
  getLaunchState(): Promise<LaunchState>;

  searchMods(profileId: string, query: string, offset: number): Promise<{ hits: ModrinthHit[]; total: number }>;
  installMod(profileId: string, projectId: string): Promise<string[]>;
  listMods(profileId: string): Promise<InstalledMod[]>;
  toggleMod(profileId: string, fileName: string): Promise<void>;
  deleteMod(profileId: string, fileName: string): Promise<void>;
  openModsFolder(profileId: string): Promise<void>;

  windowControl(action: 'minimize' | 'maximize' | 'close'): void;

  onProgress(cb: (e: ProgressEvent | null) => void): () => void;
  onLog(cb: (e: LogEvent) => void): () => void;
  onLaunchState(cb: (s: LaunchState) => void): () => void;
}
