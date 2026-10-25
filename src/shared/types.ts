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

export type ContentKind = 'mod' | 'shader';

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  featured_gallery?: string | null;
  gallery?: string[];
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

export interface UpdateState {
  /** idle — нет обновлений; downloading — качается; ready — скачано, можно ставить;
   *  manual — портативная версия, обновить можно только скачав новый exe */
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'manual' | 'error';
  version?: string;
  percent?: number;
  error?: string;
}

export interface SystemInfo {
  appVersion: string;
  portable: boolean;
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

  /** моды и шейдеры с Modrinth */
  searchContent(profileId: string, kind: ContentKind, query: string, offset: number): Promise<{ hits: ModrinthHit[]; total: number }>;
  installContent(profileId: string, kind: ContentKind, projectId: string): Promise<string[]>;
  listContent(profileId: string, kind: ContentKind): Promise<InstalledMod[]>;
  /** мод: вкл/выкл; шейдер: сделать активным / выключить */
  toggleContent(profileId: string, kind: ContentKind, fileName: string): Promise<void>;
  deleteContent(profileId: string, kind: ContentKind, fileName: string): Promise<void>;
  openContentFolder(profileId: string, kind: ContentKind): Promise<void>;

  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  openReleases(): Promise<void>;

  windowControl(action: 'minimize' | 'maximize' | 'close'): void;

  onProgress(cb: (e: ProgressEvent | null) => void): () => void;
  onLog(cb: (e: LogEvent) => void): () => void;
  onLaunchState(cb: (s: LaunchState) => void): () => void;
  onUpdate(cb: (s: UpdateState) => void): () => void;
}
