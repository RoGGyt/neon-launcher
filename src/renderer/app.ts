import { api, h, $, clear, icon, toast, guard, modal, confirmDialog, fmtNum, fmtSize, fmtAgo, loaderLabel } from './dom.js';
import type { Account, Loader, McVersion, Profile, Settings, SystemInfo, LaunchState, LogEvent, ProgressEvent, InstalledMod, ModrinthHit, UpdateState, ContentKind } from '../shared/types';

type View = 'home' | 'profiles' | 'mods' | 'shaders' | 'settings' | 'console';

const state = {
  view: 'home' as View,
  settings: null as unknown as Settings,
  sys: null as unknown as SystemInfo,
  profiles: [] as Profile[],
  versions: [] as McVersion[],
  launch: { running: false, profileId: null } as LaunchState,
  progress: null as ProgressEvent | null,
  busy: false,
  logs: [] as LogEvent[],
  contentProfileId: null as string | null,
  contentTab: { mod: 'installed', shader: 'browse' } as Record<ContentKind, 'installed' | 'browse'>,
  contentQuery: { mod: '', shader: '' } as Record<ContentKind, string>,
  update: { status: 'idle' } as UpdateState,
  cloudStatus: null as string | null,
};

const main = () => $('#view');

// ======================= каркас =======================

function avatar(acc: Account | null, size = 36): HTMLElement {
  const name = acc?.name ?? '?';
  if (acc?.type === 'ely') {
    const url = `https://skinsystem.ely.by/skins/${encodeURIComponent(acc.name)}.png`;
    const face = h('div.avatar.skin', { style: `width:${size}px;height:${size}px` });
    face.style.backgroundImage = `url("${url}")`;
    face.style.backgroundSize = `${size * 8}px auto`;
    face.style.backgroundPosition = `-${size}px -${size}px`;
    const hat = h('div.avatar-hat');
    hat.style.backgroundImage = `url("${url}")`;
    hat.style.backgroundSize = `${size * 8}px auto`;
    hat.style.backgroundPosition = `-${size * 5}px -${size}px`;
    face.append(hat);
    return face;
  }
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return h('div.avatar.letter', { style: `width:${size}px;height:${size}px;font-size:${size * 0.45}px;--hue:${hue}` }, name.slice(0, 1).toUpperCase());
}

function renderShell() {
  const nav: [View, string, Parameters<typeof icon>[0]][] = [
    ['home', 'Играть', 'play'],
    ['profiles', 'Профили', 'layers'],
    ['mods', 'Моды', 'puzzle'],
    ['shaders', 'Шейдеры', 'sun'],
    ['settings', 'Настройки', 'settings'],
    ['console', 'Консоль', 'terminal'],
  ];
  const sidebar = $('#sidebar');
  clear(sidebar);
  sidebar.append(
    h('nav.nav', {}, ...nav.map(([v, label, ic]) =>
      h(`button.nav-item${state.view === v ? '.active' : ''}`, { onclick: () => go(v), 'data-view': v },
        icon(ic, 19), h('span', {}, label),
        v === 'console' && state.launch.running ? h('span.live-dot', { title: 'Игра запущена' }) : null,
      ))),
    h('div.sidebar-foot', {},
      updateBanner(),
      h('button.account-chip', { onclick: () => go('settings'), title: 'Аккаунт' },
        avatar(state.settings.account, 34),
        h('div.account-text', {},
          h('div.account-name', {}, state.settings.account?.name ?? 'Без ника'),
          h('div.account-type', {}, state.settings.account?.type === 'ely' ? 'Ely.by' : state.settings.account ? 'Оффлайн' : 'Укажи ник'),
        ),
      ),
    ),
  );
}

function updateBanner(): HTMLElement | null {
  const u = state.update;
  if (u.status === 'downloading') {
    return h('div.update-banner', {},
      h('div.update-title', {}, `Обновление ${u.version ?? ''}`),
      h('div.update-sub', {}, `Загружается… ${u.percent ?? 0}%`),
      h('div.update-track', {}, h('div.update-fill', { style: `width:${u.percent ?? 0}%` })),
    );
  }
  if (u.status === 'ready') {
    return h('div.update-banner.ready', {},
      h('div.update-title', {}, `Версия ${u.version} готова`),
      h('button.btn.primary.sm.full', { onclick: () => guard(() => api.installUpdate()) }, icon('refresh', 14), 'Перезапустить'),
    );
  }
  if (u.status === 'manual') {
    return h('div.update-banner.ready', {},
      h('div.update-title', {}, `Вышла версия ${u.version}`),
      h('button.btn.primary.sm.full', { onclick: () => guard(() => api.openReleases()) }, icon('download', 14), 'Скачать'),
    );
  }
  return null;
}

function updateStatusText(): string {
  const u = state.update;
  switch (u.status) {
    case 'checking': return 'Проверяю…';
    case 'downloading': return `Загружаю ${u.version} (${u.percent ?? 0}%)`;
    case 'ready': return `Версия ${u.version} скачана — перезапусти лаунчер`;
    case 'manual': return `Вышла версия ${u.version}`;
    case 'error': return 'Не удалось проверить обновления';
    default: return 'У тебя последняя версия';
  }
}

function go(v: View) {
  state.view = v;
  renderShell();
  render();
}

function render() {
  const v = main();
  clear(v);
  v.scrollTop = 0;
  const page = state.view === 'home' ? viewHome()
    : state.view === 'profiles' ? viewProfiles()
    : state.view === 'mods' ? viewContent('mod')
    : state.view === 'shaders' ? viewContent('shader')
    : state.view === 'settings' ? viewSettings()
    : viewConsole();
  page.classList.add('page');
  v.append(page);
}

function selectedProfile(): Profile | undefined {
  return state.profiles.find(p => p.id === state.settings.selectedProfileId) ?? state.profiles[0];
}

// ======================= прогресс и запуск =======================

function progressBar(): HTMLElement {
  const p = state.progress;
  const ratio = p ? (p.ratio ?? (p.total > 0 ? p.done / p.total : 0)) : 0;
  const bar = h('div.progress#progress', { class: p || state.cloudStatus ? 'active' : '' },
    h('div.progress-track', {}, h('div.progress-fill', { style: `width:${Math.round(ratio * 100)}%` })),
    h('div.progress-label', {},
      h('span', {}, p ? p.stage : state.cloudStatus ?? (state.launch.running ? 'Игра запущена' : 'Готово к запуску')),
      h('span.mono', {}, p && p.total > 1 ? `${p.done} / ${p.total}` : ''),
    ),
  );
  return bar;
}

function updateProgress() {
  const old = document.getElementById('progress');
  if (old) old.replaceWith(progressBar());
  const btn = document.getElementById('play-btn');
  if (btn) btn.replaceWith(playButton());
}

function playButton(): HTMLElement {
  const p = selectedProfile();
  if (state.launch.running) {
    return h('button.play-btn.running#play-btn', { onclick: () => guard(() => api.killGame()) },
      icon('stop', 22), h('span', {}, 'Закрыть игру'));
  }
  if (state.launch.cloud) {
    // облачная сессия: ждём хоста или сохраняем мир
    return h('button.play-btn.cloud-wait#play-btn', { onclick: () => guard(() => api.killGame()), title: 'Отменить' },
      icon('cloud', 22), h('span', {}, 'Облако…'));
  }
  return h('button.play-btn#play-btn', { disabled: state.busy || !p, onclick: () => p && launch(p.id) },
    icon(p?.cloud ? 'cloud' : 'play', 24), h('span', {}, state.busy ? 'Загрузка…' : 'Играть'));
}

async function launch(profileId: string) {
  if (state.busy) return;
  if (!state.settings.account) {
    const input = document.getElementById('nick-input') as HTMLInputElement | null;
    const nick = input?.value.trim() ?? state.settings.nickname;
    if (!nick) {
      toast('Сначала введи ник', 'error');
      input?.focus();
      return;
    }
    const acc = await guard(() => api.loginOffline(nick));
    if (!acc) return;
    state.settings = await api.getSettings();
    renderShell();
  }
  state.busy = true;
  updateProgress();
  try {
    await api.launch(profileId);
    state.settings = await api.getSettings();
    state.profiles = await api.listProfiles();
  } catch (e) {
    toast((e as Error).message, 'error', 8000);
  } finally {
    state.busy = false;
    state.progress = null;
    if (state.view === 'home') render(); else updateProgress();
  }
}

// ======================= ГЛАВНАЯ =======================

function viewHome(): HTMLElement {
  const p = selectedProfile();
  const acc = state.settings.account;

  if (!p) {
    return h('div.home', {},
      h('div.hero.empty', {},
        h('div.hero-kicker', {}, 'Добро пожаловать'),
        h('h1.hero-title', {}, 'Создай первый профиль'),
        h('p.muted', {}, 'Профиль — это версия игры, модлоадер и своя папка с мирами и модами.'),
        h('button.btn.primary.lg', { onclick: () => editProfile() }, icon('plus'), 'Новый профиль'),
      ),
    );
  }

  const nickBlock = acc?.type === 'ely'
    ? h('div.nick-row', {}, avatar(acc, 44), h('div', {}, h('div.nick-label', {}, 'Вход через Ely.by'), h('div.nick-value', {}, acc.name)))
    : h('div.nick-row', {},
        avatar(acc, 44),
        h('div.nick-field', {},
          h('label.nick-label', { for: 'nick-input' }, 'Ник'),
          h('input.input.nick-input#nick-input', {
            value: acc?.name ?? state.settings.nickname ?? '',
            placeholder: 'Steve',
            maxlength: 16,
            spellcheck: 'false',
            onchange: async (e: Event) => {
              const v = (e.target as HTMLInputElement).value.trim();
              if (!v) return;
              if (await guard(() => api.loginOffline(v))) {
                state.settings = await api.getSettings();
                renderShell();
                toast(`Ник сохранён: ${v}`, 'ok', 2000);
              }
            },
          }),
        ),
      );

  const recent = [...state.profiles]
    .sort((a, b) => (b.lastPlayed ?? b.createdAt) - (a.lastPlayed ?? a.createdAt))
    .slice(0, 6);

  return h('div.home', {},
    h('section.hero', { style: `--accent:${p.color}` },
      h('div.hero-grid'),
      h('div.hero-content', {},
        h('div.hero-kicker', {}, 'Текущий профиль'),
        h('h1.hero-title', {}, p.name),
        h('div.badges', {},
          h('span.badge', {}, icon('cube', 14), p.mcVersion),
          h(`span.badge.loader-${p.loader}`, {}, loaderLabel(p.loader), p.loaderVersion ? ` ${p.loaderVersion.replace(`${p.mcVersion}-`, '')}` : ''),
          h('span.badge', {}, `${(p.ramMb / 1024).toFixed(1).replace('.0', '')} ГБ RAM`),
          p.cloud ? h('span.badge.cloud', { title: 'Мир хранится на Яндекс Диске' }, icon('cloud', 14), `Облачный мир «${p.cloud.worldName}»`) : null,
          p.autoJoin && p.serverAddress && !p.cloud ? h('span.badge.server', { title: '«Играть» сразу заходит на сервер' }, icon('users', 14), p.serverName || p.serverAddress) : null,
        ),
        h('div.hero-actions', {},
          playButton(),
          h('button.btn.friends-btn', { onclick: () => openFriends(p), title: 'Играть с друзьями' }, icon('users', 18), 'С друзьями'),
          h('div.hero-side', {}, nickBlock),
        ),
        progressBar(),
      ),
    ),
    h('div.section-head', {}, h('h3', {}, 'Профили'), h('button.link', { onclick: () => go('profiles') }, 'Все профили →')),
    h('div.quick-list', {},
      ...recent.map(r => h(`button.quick${r.id === p.id ? '.selected' : ''}`, {
        style: `--accent:${r.color}`,
        onclick: async () => {
          state.settings = await api.saveSettings({ selectedProfileId: r.id });
          render();
        },
      },
        h('span.quick-stripe'),
        h('span.quick-name', {}, r.name),
        h('span.quick-meta', {}, `${loaderLabel(r.loader)} ${r.mcVersion}`),
        h('span.quick-time', {}, fmtAgo(r.lastPlayed)),
      )),
      h('button.quick.add', { onclick: () => editProfile() }, icon('plus', 20), h('span', {}, 'Новый')),
    ),
  );
}

// ======================= ПРОФИЛИ =======================

function viewProfiles(): HTMLElement {
  return h('div', {},
    h('div.page-head', {},
      h('div', {}, h('h1', {}, 'Профили'), h('p.muted', {}, 'У каждого профиля своя папка: миры, моды, настройки и ресурспаки.')),
      h('div.row', {},
        h('button.btn.ghost', { onclick: () => openImport() }, icon('download', 16), 'Импорт по коду'),
        h('button.btn.primary', { onclick: () => editProfile() }, icon('plus'), 'Новый профиль'),
      ),
    ),
    state.profiles.length === 0
      ? h('div.empty-state', {}, icon('layers', 40), h('p', {}, 'Пока пусто. Создай профиль с нужной версией.'))
      : h('div.cards', {}, ...state.profiles.map(profileCard)),
  );
}

function profileCard(p: Profile): HTMLElement {
  const running = state.launch.running && state.launch.profileId === p.id;
  return h('div.card.profile-card', { style: `--accent:${p.color}` },
    h('div.card-glow'),
    h('div.card-top', {},
      h('div.card-icon', {}, icon('cube', 22)),
      h('div.card-title', {}, h('div.card-name', {}, p.name), h('div.card-sub', {}, `${loaderLabel(p.loader)} · ${p.mcVersion}`)),
      running ? h('span.pill.live', {}, 'в игре') : null,
    ),
    h('div.card-meta', {},
      h('span', {}, `${(p.ramMb / 1024).toFixed(1).replace('.0', '')} ГБ`),
      h('span', {}, fmtAgo(p.lastPlayed)),
    ),
    h('div.card-actions', {},
      h('button.btn.primary.sm', {
        disabled: state.busy || state.launch.running,
        onclick: async () => {
          state.settings = await api.saveSettings({ selectedProfileId: p.id });
          go('home');
          launch(p.id);
        },
      }, icon('play', 14), 'Играть'),
      h('button.icon-btn', { title: 'Изменить', onclick: () => editProfile(p) }, icon('edit', 16)),
      h('button.icon-btn', { title: 'С друзьями', onclick: () => openFriends(p) }, icon('users', 16)),
      h('button.icon-btn', { title: 'Открыть папку', onclick: () => guard(() => api.openProfileFolder(p.id)) }, icon('folder', 16)),
      p.loader !== 'vanilla' ? h('button.icon-btn', { title: 'Моды', onclick: () => { state.contentProfileId = p.id; go('mods'); } }, icon('puzzle', 16)) : null,
      h('button.icon-btn.danger', { title: 'Удалить', onclick: () => removeProfile(p) }, icon('trash', 16)),
    ),
  );
}

async function removeProfile(p: Profile) {
  const ok = await confirmDialog('Удалить профиль?', `«${p.name}» исчезнет из списка вместе со своей папкой (миры, моды, настройки). Скачанные версии игры останутся.`, 'Удалить');
  if (!ok) return;
  await guard(() => api.deleteProfile(p.id, true));
  state.profiles = await api.listProfiles();
  state.settings = await api.getSettings();
  render();
}

async function ensureVersions(force = false) {
  if (state.versions.length && !force) return;
  const v = await guard(() => api.listVersions(force));
  if (v) state.versions = v;
}

function filteredVersions(showSnap: boolean, showOld: boolean): McVersion[] {
  return state.versions.filter(v =>
    v.type === 'release' || (showSnap && v.type === 'snapshot') || (showOld && (v.type === 'old_beta' || v.type === 'old_alpha')));
}

async function editProfile(existing?: Profile, preset: { loader?: Loader } = {}) {
  await ensureVersions();
  if (!state.versions.length) return;

  const latest = state.versions.find(v => v.type === 'release')?.id ?? '';
  const draft = {
    name: existing?.name ?? '',
    mcVersion: existing?.mcVersion ?? latest,
    loader: (preset.loader ?? existing?.loader ?? 'vanilla') as Loader,
    loaderVersion: existing?.loaderVersion,
    ramMb: existing?.ramMb ?? state.settings.defaultRamMb,
    javaPath: existing?.javaPath ?? '',
    jvmArgs: existing?.jvmArgs ?? '',
    width: existing?.width,
    height: existing?.height,
  };
  let showSnap = state.settings.showSnapshots || ['snapshot'].includes(state.versions.find(v => v.id === draft.mcVersion)?.type ?? '');
  let showOld = state.settings.showOld || ['old_beta', 'old_alpha'].includes(state.versions.find(v => v.id === draft.mcVersion)?.type ?? '');

  const nameInput = h('input.input', { value: draft.name, placeholder: 'Например: Выживание с друзьями', maxlength: 40 }) as HTMLInputElement;
  const versionSelect = h('select.input') as HTMLSelectElement;
  const loaderSeg = h('div.segmented');
  const loaderVerSelect = h('select.input') as HTMLSelectElement;
  const loaderVerRow = h('div.field');
  const ramOut = h('span.mono.ram-out');
  const maxRam = Math.max(2048, Math.floor(state.sys.totalMemMb * 0.85 / 512) * 512);
  const ramRange = h('input.range', { type: 'range', min: 1024, max: maxRam, step: 512, value: Math.min(draft.ramMb, maxRam) }) as HTMLInputElement;
  const javaInput = h('input.input', { value: draft.javaPath, placeholder: 'Авто — нужная Java скачается сама' }) as HTMLInputElement;
  const jvmInput = h('input.input.mono', { value: draft.jvmArgs, placeholder: '-XX:+UseZGC' }) as HTMLInputElement;
  const wInput = h('input.input', { type: 'number', min: 320, value: draft.width ?? '', placeholder: 'ширина' }) as HTMLInputElement;
  const hInput = h('input.input', { type: 'number', min: 240, value: draft.height ?? '', placeholder: 'высота' }) as HTMLInputElement;

  const updateRam = () => {
    const mb = Number(ramRange.value);
    ramOut.textContent = `${(mb / 1024).toFixed(1).replace('.0', '')} ГБ`;
    const pct = ((mb - 1024) / (maxRam - 1024)) * 100;
    ramRange.style.setProperty('--fill', `${pct}%`);
  };
  ramRange.addEventListener('input', updateRam);
  updateRam();

  const fillVersions = () => {
    clear(versionSelect);
    const list = filteredVersions(showSnap, showOld);
    if (!list.some(v => v.id === draft.mcVersion)) draft.mcVersion = list[0]?.id ?? '';
    for (const v of list) {
      const label = `${v.id}${v.type === 'snapshot' ? '  · снапшот' : v.type === 'old_beta' ? '  · бета' : v.type === 'old_alpha' ? '  · альфа' : ''}${v.installed ? '  ✓' : ''}`;
      versionSelect.append(h('option', { value: v.id, selected: v.id === draft.mcVersion }, label));
    }
  };

  let loaderReq = 0;
  const fillLoaderVersions = async () => {
    clear(loaderVerSelect);
    loaderVerRow.style.display = draft.loader === 'vanilla' ? 'none' : '';
    if (draft.loader === 'vanilla') { draft.loaderVersion = undefined; return; }
    const req = ++loaderReq;
    loaderVerSelect.disabled = true;
    loaderVerSelect.append(h('option', {}, 'Загрузка…'));
    const list = await guard(() => api.listLoaderVersions(draft.loader, draft.mcVersion));
    if (req !== loaderReq) return;
    clear(loaderVerSelect);
    if (!list || list.length === 0) {
      loaderVerSelect.append(h('option', { value: '' }, `${loaderLabel(draft.loader)} нет для ${draft.mcVersion}`));
      draft.loaderVersion = undefined;
      return;
    }
    loaderVerSelect.disabled = false;
    if (!list.some(l => l.id === draft.loaderVersion)) draft.loaderVersion = (list.find(l => l.recommended) ?? list[0]).id;
    for (const l of list.slice(0, 80)) {
      const shown = l.id.startsWith(`${draft.mcVersion}-`) ? l.id.slice(draft.mcVersion.length + 1) : l.id;
      loaderVerSelect.append(h('option', { value: l.id, selected: l.id === draft.loaderVersion }, `${shown}${l.recommended ? '  ★ рекомендуемая' : !l.stable && draft.loader === 'fabric' ? '  · beta' : ''}`));
    }
  };

  const renderLoaderSeg = () => {
    clear(loaderSeg);
    for (const l of ['vanilla', 'fabric', 'forge'] as Loader[]) {
      loaderSeg.append(h(`button.seg${draft.loader === l ? '.active' : ''}`, {
        type: 'button',
        onclick: () => { draft.loader = l; renderLoaderSeg(); fillLoaderVersions(); },
      }, loaderLabel(l)));
    }
  };

  const chip = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const b = h(`button.chip${get() ? '.on' : ''}`, { type: 'button' }, label);
    b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', get()); fillVersions(); fillLoaderVersions(); });
    return b;
  };

  versionSelect.addEventListener('change', () => { draft.mcVersion = versionSelect.value; fillLoaderVersions(); });
  loaderVerSelect.addEventListener('change', () => { draft.loaderVersion = loaderVerSelect.value; });

  fillVersions();
  renderLoaderSeg();
  loaderVerRow.append(h('label', {}, 'Версия модлоадера'), loaderVerSelect);
  fillLoaderVersions();

  const advanced = h('details.advanced', {},
    h('summary', {}, 'Дополнительно'),
    h('div.field', {}, h('label', {}, 'Путь к Java'), javaInput),
    h('div.field', {}, h('label', {}, 'JVM-аргументы'), jvmInput),
    h('div.field', {}, h('label', {}, 'Размер окна'), h('div.row', {}, wInput, h('span.muted', {}, '×'), hInput)),
  );

  const body = h('div.form', {},
    h('div.field', {}, h('label', {}, 'Название'), nameInput),
    h('div.field', {},
      h('label', {}, 'Версия Minecraft'),
      h('div.chips', {},
        chip('Снапшоты', () => showSnap, v => (showSnap = v)),
        chip('Альфа и бета', () => showOld, v => (showOld = v)),
      ),
      versionSelect,
    ),
    h('div.field', {}, h('label', {}, 'Модлоадер'), loaderSeg),
    loaderVerRow,
    h('div.field', {}, h('label', {}, 'Оперативная память ', ramOut), ramRange,
      h('div.range-scale', {}, h('span', {}, '1 ГБ'), h('span', {}, `${(maxRam / 1024).toFixed(0)} ГБ`))),
    advanced,
  );

  const save = async () => {
    if (!draft.mcVersion) return toast('Выбери версию', 'error');
    if (draft.loader !== 'vanilla' && !draft.loaderVersion) return toast(`Для этой версии нет ${loaderLabel(draft.loader)}`, 'error');
    const w = Number(wInput.value) || undefined;
    const hh = Number(hInput.value) || undefined;
    const saved = await guard(() => api.saveProfile({
      id: existing?.id,
      name: nameInput.value.trim(),
      mcVersion: draft.mcVersion,
      loader: draft.loader,
      loaderVersion: draft.loader === 'vanilla' ? undefined : draft.loaderVersion,
      ramMb: Number(ramRange.value),
      javaPath: javaInput.value.trim() || undefined,
      jvmArgs: jvmInput.value.trim() || undefined,
      width: w && hh ? w : undefined,
      height: w && hh ? hh : undefined,
    }));
    if (!saved) return;
    m.close();
    state.profiles = await api.listProfiles();
    if (!existing) state.settings = await api.saveSettings({ selectedProfileId: saved.id });
    toast(existing ? 'Профиль сохранён' : `Профиль «${saved.name}» создан`, 'ok', 2500);
    render();
  };

  const m = modal(existing ? 'Изменить профиль' : 'Новый профиль', body, [
    h('button.btn.ghost', { onclick: () => m.close() }, 'Отмена'),
    h('button.btn.primary', { onclick: save }, existing ? 'Сохранить' : 'Создать'),
  ]);
  nameInput.focus();
}

// ======================= МОДЫ И ШЕЙДЕРЫ =======================

const KIND_TEXT = {
  mod: {
    title: 'Моды', one: 'мод', many: 'модов', folder: 'Папка mods', iconName: 'puzzle' as const,
    sub: 'Зависимости (например Fabric API) ставятся автоматически.',
    empty: 'Модов пока нет.', url: 'mod',
  },
  shader: {
    title: 'Шейдеры', one: 'шейдер', many: 'шейдеров', folder: 'Папка shaderpacks', iconName: 'sun' as const,
    sub: 'Iris (или Oculus для Forge) и Sodium поставятся сами. Активный шейдер включится при запуске игры.',
    empty: 'Шейдеров пока нет.', url: 'shader',
  },
};

function viewContent(kind: ContentKind): HTMLElement {
  const T = KIND_TEXT[kind];
  const moddable = state.profiles.filter(p => p.loader !== 'vanilla');
  if (moddable.length === 0) {
    return h('div', {},
      h('div.page-head', {}, h('div', {}, h('h1', {}, T.title), h('p.muted', {}, kind === 'mod'
        ? 'Каталог Modrinth: тысячи модов для Fabric и Forge.'
        : 'Каталог шейдеров с Modrinth: Complementary, BSL, Sildur’s и другие.'))),
      h('div.empty-state', {}, icon(T.iconName, 40),
        h('p', {}, kind === 'mod'
          ? 'Моды работают через модлоадер — Fabric или Forge. В ванильной игре их нет.'
          : 'Шейдеры работают через мод Iris, а ему нужен Fabric. В ванильной игре шейдеров нет.'),
        h('div.row.wrap-center', {},
          h('button.btn.primary', { onclick: () => editProfile(undefined, { loader: 'fabric' }) }, icon('plus'), 'Создать Fabric-профиль'),
          kind === 'mod' ? h('button.btn.ghost', { onclick: () => editProfile(undefined, { loader: 'forge' }) }, 'Forge-профиль') : null,
        ),
        state.profiles.length > 0
          ? h('div.convert', {},
              h('p.muted.small', {}, 'Или добавь Fabric в существующий профиль — миры и настройки останутся:'),
              h('div.convert-list', {}, ...state.profiles.map(p =>
                h('button.chip', { onclick: () => editProfile(p, { loader: 'fabric' }) }, `${p.name} · ${p.mcVersion}`))),
            )
          : null),
    );
  }
  if (!moddable.some(p => p.id === state.contentProfileId)) {
    const sel = selectedProfile();
    state.contentProfileId = sel && sel.loader !== 'vanilla' ? sel.id : moddable[0].id;
  }
  const profile = moddable.find(p => p.id === state.contentProfileId)!;
  const tab = state.contentTab[kind];

  const profileSelect = h('select.input.compact', {
    onchange: (e: Event) => { state.contentProfileId = (e.target as HTMLSelectElement).value; render(); },
  }, ...moddable.map(p => h('option', { value: p.id, selected: p.id === profile.id }, `${p.name} — ${loaderLabel(p.loader)} ${p.mcVersion}`))) as HTMLSelectElement;

  const setTab = (t: 'installed' | 'browse') => { state.contentTab[kind] = t; render(); };
  const content = h('div.mods-content');
  if (tab === 'installed') renderInstalled(profile, kind, content);
  else renderBrowse(profile, kind, content);

  return h('div', {},
    h('div.page-head', {},
      h('div', {}, h('h1', {}, T.title), h('p.muted', {}, T.sub)),
      h('div.row', {}, profileSelect, h('button.icon-btn', { title: T.folder, onclick: () => guard(() => api.openContentFolder(profile.id, kind)) }, icon('folder', 18))),
    ),
    h('div.tabs', {},
      h(`button.tab${tab === 'installed' ? '.active' : ''}`, { onclick: () => setTab('installed') }, 'Установленные'),
      h(`button.tab${tab === 'browse' ? '.active' : ''}`, { onclick: () => setTab('browse') }, 'Каталог Modrinth'),
    ),
    content,
  );
}

async function renderInstalled(profile: Profile, kind: ContentKind, box: HTMLElement) {
  const T = KIND_TEXT[kind];
  box.append(h('div.loading', {}, 'Загрузка…'));
  const items = await guard(() => api.listContent(profile.id, kind));
  clear(box);
  if (!items || items.length === 0) {
    box.append(h('div.empty-state', {}, icon(T.iconName, 36), h('p', {}, T.empty),
      h('button.btn.primary', { onclick: () => { state.contentTab[kind] = 'browse'; render(); } }, icon('search'), 'Открыть каталог')));
    return;
  }
  if (kind === 'shader' && !items.some(i => i.enabled)) {
    box.append(h('p.muted.small.hint', {}, 'Сейчас шейдеры выключены — нажми «Включить» у нужного.'));
  }
  box.append(h('div.list', {}, ...items.map(item => installedRow(profile, kind, item))));
}

function modIcon(url: string | null | undefined, kind: ContentKind = 'mod'): HTMLElement {
  return url ? h('img.mod-icon', { src: url, alt: '', loading: 'lazy' }) : h('div.mod-icon.blank', {}, icon(KIND_TEXT[kind].iconName, 20));
}

function installedRow(profile: Profile, kind: ContentKind, item: InstalledMod): HTMLElement {
  const toggleAction = async () => {
    await guard(() => api.toggleContent(profile.id, kind, item.fileName));
    render();
  };
  const control = kind === 'shader'
    ? (item.enabled
        ? h('button.btn.sm.active-shader', { onclick: toggleAction, title: 'Выключить шейдеры' }, icon('check', 14), 'Активен')
        : h('button.btn.ghost.sm', { onclick: toggleAction }, 'Включить'))
    : h(`button.switch${item.enabled ? '.on' : ''}`, { title: item.enabled ? 'Выключить' : 'Включить', onclick: toggleAction }, h('span.knob'));
  const dim = kind === 'mod' && !item.enabled;
  return h(`div.row-item${dim ? '.disabled' : ''}${kind === 'shader' && item.enabled ? '.glow' : ''}`, {},
    modIcon(item.iconUrl, kind),
    h('div.row-main', {},
      h('div.row-title', {}, item.title),
      h('div.row-sub.mono', {}, [item.versionNumber ?? item.fileName, item.sizeBytes ? fmtSize(item.sizeBytes) : 'папка'].join(' · ')),
    ),
    control,
    h('button.icon-btn.danger', {
      title: 'Удалить',
      onclick: async () => {
        await guard(() => api.deleteContent(profile.id, kind, item.fileName));
        render();
      },
    }, icon('trash', 16)),
  );
}

function renderBrowse(profile: Profile, kind: ContentKind, box: HTMLElement) {
  const T = KIND_TEXT[kind];
  const results = h(`div.list${kind === 'shader' ? '.shader-grid' : ''}`);
  const more = h('div.more');
  let offset = 0;
  let total = 0;
  let req = 0;
  let installedIds = new Set<string>();

  const search = h('input.input.search-input', {
    value: state.contentQuery[kind],
    placeholder: kind === 'mod' ? `Поиск модов для ${loaderLabel(profile.loader)} ${profile.mcVersion}…` : 'Поиск шейдеров: Complementary, BSL, Solas…',
    spellcheck: 'false',
  }) as HTMLInputElement;

  const load = async (reset: boolean) => {
    if (reset) { offset = 0; clear(results); results.append(h('div.loading', {}, 'Ищу…')); }
    const my = ++req;
    const [res, items] = await Promise.all([
      guard(() => api.searchContent(profile.id, kind, state.contentQuery[kind], offset)),
      reset ? guard(() => api.listContent(profile.id, kind)) : Promise.resolve(undefined),
    ]);
    if (my !== req) return;
    if (items) installedIds = new Set(items.map(m => m.projectId).filter(Boolean) as string[]);
    if (reset) clear(results);
    if (!res) return;
    total = res.total;
    if (res.hits.length === 0 && offset === 0) results.append(h('div.empty-state.small', {}, h('p', {}, 'Ничего не найдено')));
    for (const hit of res.hits) results.append(kind === 'shader' ? shaderCard(profile, hit, installedIds) : browseRow(profile, hit, installedIds));
    offset += res.hits.length;
    clear(more);
    if (offset < total) more.append(h('button.btn.ghost', { onclick: () => load(false) }, `Показать ещё ${T.many}`));
  };

  let t: number | undefined;
  search.addEventListener('input', () => {
    state.contentQuery[kind] = search.value;
    clearTimeout(t);
    t = window.setTimeout(() => load(true), 350);
  });

  box.append(h('div.search-wrap', {}, icon('search', 18), search), results, more);
  load(true);
  setTimeout(() => search.focus(), 0);
}

function installButton(profile: Profile, kind: ContentKind, hit: ModrinthHit, installed: Set<string>): HTMLButtonElement {
  const isInstalled = installed.has(hit.project_id);
  const btn = h(`button.btn.sm${isInstalled ? '.ghost' : '.primary'}`, { disabled: isInstalled },
    isInstalled ? icon('check', 14) : icon('download', 14), isInstalled ? 'Установлен' : 'Установить') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.replaceChildren('Ставлю…');
    const names = await guard(() => api.installContent(profile.id, kind, hit.project_id));
    if (names) {
      installed.add(hit.project_id);
      btn.className = 'btn sm ghost';
      btn.replaceChildren(icon('check', 14), 'Установлен');
      toast(names.length > 1 ? `Установлено: ${names.join(', ')}` : `${hit.title} установлен`, 'ok');
    } else {
      btn.disabled = false;
      btn.replaceChildren(icon('download', 14), 'Установить');
    }
  });
  return btn;
}

function browseRow(profile: Profile, hit: ModrinthHit, installed: Set<string>): HTMLElement {
  return h('div.row-item.browse', {},
    modIcon(hit.icon_url),
    h('div.row-main', {},
      h('div.row-title', {},
        h('a.mod-link', { href: `https://modrinth.com/mod/${hit.slug}`, target: '_blank' }, hit.title),
        h('span.row-author', {}, ` от ${hit.author}`)),
      h('div.row-desc', {}, hit.description),
      h('div.row-sub', {}, h('span.mono', {}, `↓ ${fmtNum(hit.downloads)}`), ...hit.categories.filter(c => !['fabric', 'forge', 'quilt', 'neoforge'].includes(c)).slice(0, 3).map(c => h('span.tag', {}, c))),
    ),
    installButton(profile, 'mod', hit, installed),
  );
}

function shaderCard(profile: Profile, hit: ModrinthHit, installed: Set<string>): HTMLElement {
  const cover = hit.featured_gallery ?? hit.gallery?.[0] ?? null;
  return h('div.shader-card', {},
    cover
      ? h('div.shader-cover', {}, h('img', { src: cover, alt: '', loading: 'lazy' }))
      : h('div.shader-cover.blank', {}, icon('sun', 34)),
    h('div.shader-body', {},
      h('div.shader-head', {},
        modIcon(hit.icon_url, 'shader'),
        h('div.row-main', {},
          h('a.mod-link.row-title', { href: `https://modrinth.com/shader/${hit.slug}`, target: '_blank' }, hit.title),
          h('div.row-sub', {}, h('span', {}, hit.author), h('span.mono', {}, `↓ ${fmtNum(hit.downloads)}`)),
        ),
      ),
      h('div.row-desc', {}, hit.description),
      installButton(profile, 'shader', hit, installed),
    ),
  );
}


// ======================= С ДРУЗЬЯМИ =======================

type FriendsTab = 'world' | 'cloud' | 'server' | 'share';

function openFriends(p: Profile, startTab?: FriendsTab) {
  let tab: FriendsTab = startTab ?? (p.cloud ? 'cloud' : p.serverAddress ? 'server' : 'world');
  const body = h('div.friends');
  const m = modal('Играть с друзьями', body, [h('button.btn.ghost', { onclick: () => m.close() }, 'Закрыть')]);

  const steps = (...items: (string | HTMLElement)[]) => h('ol.steps', {}, ...items.map(i => h('li', {}, i)));

  const draw = () => {
    clear(body);
    const tabs = h('div.segmented.friends-tabs', {},
      ...([['world', 'Мой мир'], ['cloud', 'Облачный мир'], ['server', 'Сервер'], ['share', 'Поделиться']] as [FriendsTab, string][]).map(([t, label]) =>
        h(`button.seg${tab === t ? '.active' : ''}`, { type: 'button', onclick: () => { tab = t; draw(); } }, label)));
    body.append(tabs);
    if (tab === 'world') body.append(worldTab());
    else if (tab === 'cloud') body.append(cloudTab());
    else if (tab === 'server') body.append(serverTab());
    else body.append(shareTab());
  };

  // --- открыть свой мир через e4all ---
  const worldTab = () => {
    const box = h('div.friends-pane', {},
      h('p.muted', {}, 'Друзья заходят в твой мир, пока ты в игре. Без Hamachi и проброса портов.'));
    if (p.loader === 'vanilla') {
      box.append(
        h('p', {}, 'Для этого нужен мод e4all, а ему нужен Fabric.'),
        h('button.btn.primary', { onclick: () => { m.close(); editProfile(p, { loader: 'fabric' }); } }, 'Добавить Fabric в профиль'),
      );
      return box;
    }
    const btn = h('button.btn.primary', {}, icon('download', 16), 'Установить e4all') as HTMLButtonElement;
    const status = h('span.muted.small');
    guard(() => api.listContent(p.id, 'mod')).then(list => {
      if (list?.some(x => /e4all/i.test(x.title) || /^e4all/i.test(x.fileName))) {
        btn.disabled = true;
        btn.replaceChildren(icon('check', 16), 'e4all установлен');
      }
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.replaceChildren('Ставлю…');
      const res = await guard(() => api.installContent(p.id, 'mod', 'e4all'));
      if (res) {
        btn.replaceChildren(icon('check', 16), 'e4all установлен');
        toast('e4all установлен', 'ok');
      } else {
        btn.disabled = false;
        btn.replaceChildren(icon('download', 16), 'Установить e4all');
        status.textContent = 'Если e4all нет для этой версии — попробуй версию 1.18 или новее.';
      }
    });
    box.append(
      h('div.row', {}, btn, status),
      steps(
        'Зайди в свой мир → Esc → «Открыть для сети».',
        'Выключи «Online Mode» и нажми «Открыть мир».',
        'В чате появится адрес — скинь его друзьям.',
        'Друзья: «Сетевая игра» → «Прямое подключение» → адрес.',
      ),
      h('p.muted.small', {}, 'Пока ты не в игре, мир закрыт. Чтобы друзья играли без тебя — вкладка «Сервер 24/7».'),
    );
    return box;
  };


  // --- облачный мир на Яндекс Диске ---
  const cloudTab = () => {
    const box = h('div.friends-pane');
    const intro = h('p.muted', {}, 'Мир хранится в облаке. Кто первый нажал «Играть» — тот хост, остальные подключаются к нему сами. Хост вышел — хостом становится следующий.');
    box.append(intro);

    if (p.cloud) {
      const who = h('div.cloud-who.muted', {}, 'Проверяю, кто сейчас играет…');
      guard(() => api.cloudWho(p.id)).then(w => {
        who.textContent = w ? (w.state === 'open' ? `Сейчас играет ${w.host} — нажмёшь «Играть» и попадёшь к нему` : `${w.host} ${w.state === 'saving' ? 'сохраняет мир' : 'открывает мир'}…`) : 'Сейчас никто не играет — нажмёшь «Играть» и станешь хостом';
      });
      box.append(
        h('div.cloud-card', {}, icon('cloud', 28), h('div', {},
          h('div.setting-label', {}, `«${p.cloud.worldName}»`),
          h('div.muted.small', {}, `Облако ${p.cloud.owner} · Яндекс Диск`))),
        who,
        steps('Скинь друзьям код со вкладки «Поделиться».', 'Друг: «Профили» → «Импорт по коду».', 'Все просто жмут «Играть».'),
        h('p.muted.small', {}, 'Если у хоста выключится компьютер, потеряется максимум 5 минут игры — мир автоматически сохраняется в облако.'),
        h('div.row', {},
          h('button.btn.primary', { onclick: () => { tab = 'share'; draw(); } }, icon('users', 16), 'Пригласить друзей'),
          h('button.btn.ghost.sm', {
            onclick: async () => {
              if (!await confirmDialog('Отключить облако?', 'Профиль снова станет обычным, мир останется у тебя. В облаке он не удалится.', 'Отключить')) return;
              await guard(() => api.cloudDetach(p.id));
              state.profiles = await api.listProfiles();
              Object.assign(p, state.profiles.find(x => x.id === p.id));
              delete p.cloud;
              render(); draw();
            },
          }, 'Отключить облако'),
        ),
      );
      return box;
    }

    const versionOk = /^1\.(\d+)/.test(p.mcVersion) ? Number(/^1\.(\d+)/.exec(p.mcVersion)![1]) >= 20 : /^\d{2}\./.test(p.mcVersion);
    if (p.loader !== 'fabric' || !versionOk) {
      box.append(
        h('p', {}, 'Облачный мир работает на Fabric и версиях 1.20 и новее.'),
        h('button.btn.primary', { onclick: () => { m.close(); editProfile(p, { loader: 'fabric' }); } }, 'Изменить профиль'),
      );
      return box;
    }

    const body2 = h('div.friends-pane', {}, h('div.loading', {}, 'Загрузка…'));
    box.append(body2);
    (async () => {
      const available = await guard(() => api.cloudAvailable());
      clear(body2);
      if (!available) {
        body2.append(h('p.muted', {}, 'Облачные миры появятся в следующем обновлении лаунчера.'));
        return;
      }
      if (!state.settings.yandex?.token) {
        const login = h('button.btn.primary', {}, icon('cloud', 16), 'Войти через Яндекс') as HTMLButtonElement;
        login.addEventListener('click', async () => {
          login.disabled = true;
          const ok = await guard(() => api.cloudLogin());
          login.disabled = false;
          if (ok) { state.settings = await api.getSettings(); toast('Яндекс Диск подключён', 'ok'); draw(); }
        });
        body2.append(
          h('p', {}, 'Мир будет храниться на твоём Яндекс Диске (бесплатно, 5 ГБ хватит надолго).'),
          h('p.muted.small', {}, 'Лаунчер получит доступ только к своей папке на Диске, твои файлы он не видит.'),
          h('div.row', {}, login),
        );
        return;
      }
      const worlds = (await guard(() => api.cloudWorlds(p.id))) ?? [];
      if (!worlds.length) {
        body2.append(
          h('p', {}, 'В этом профиле пока нет миров.'),
          steps('Нажми «Играть» и создай мир в одиночной игре.', 'Выйди из игры.', 'Вернись сюда и загрузи мир в облако.'),
        );
        return;
      }
      let chosen = worlds[0].folder;
      const list = h('div.world-list', {}, ...worlds.map(w => {
        const item = h(`button.world-item${w.folder === chosen ? '.on' : ''}`, { type: 'button' },
          h('span.world-name', {}, w.folder), h('span.muted.small', {}, fmtAgo(w.lastPlayed)));
        item.addEventListener('click', () => {
          chosen = w.folder;
          list.querySelectorAll('.world-item').forEach(el => el.classList.toggle('on', el === item));
        });
        return item;
      }));
      const up = h('button.btn.primary', {}, icon('cloud', 16), 'Загрузить мир в облако') as HTMLButtonElement;
      const status = h('span.muted.small');
      const off = api.onProgress(pr => { if (pr) status.textContent = `${pr.stage}: ${pr.done}/${pr.total}`; });
      up.addEventListener('click', async () => {
        up.disabled = true;
        const res = await guard(() => api.cloudCreate(p.id, chosen));
        up.disabled = false;
        status.textContent = '';
        if (!res) return;
        off();
        state.profiles = await api.listProfiles();
        Object.assign(p, state.profiles.find(x => x.id === p.id));
        toast(`Мир «${chosen}» теперь в облаке — пригласи друзей`, 'ok');
        render();
        tab = 'share';
        draw();
      });
      body2.append(
        h('div.field', {}, h('label', {}, 'Какой мир сделать общим'), list),
        h('div.row', {}, up, status),
        h('div.row', {}, h('span.muted.small', {}, 'Яндекс подключён'), h('button.link.small', {
          onclick: async () => { await guard(() => api.cloudLogout()); state.settings = await api.getSettings(); draw(); },
        }, 'выйти')),
      );
    })();
    return box;
  };

  // --- сервер, который работает без хоста ---
  const serverTab = () => {
    const addr = h('input.input.mono', { value: p.serverAddress ?? '', placeholder: 'наш-сервер.aternos.me:12345', spellcheck: 'false' }) as HTMLInputElement;
    const name = h('input.input', { value: p.serverName ?? '', placeholder: 'Сервер друзей', maxlength: 40 }) as HTMLInputElement;
    let auto = p.autoJoin ?? true;
    const sw = h(`button.switch${auto ? '.on' : ''}`, { type: 'button' }, h('span.knob'));
    sw.addEventListener('click', () => { auto = !auto; sw.classList.toggle('on', auto); });
    const save = async () => {
      const saved = await guard(() => api.saveProfile({ ...p, serverAddress: addr.value.trim(), serverName: name.value.trim(), autoJoin: auto }));
      if (!saved) return;
      Object.assign(p, saved);
      state.profiles = await api.listProfiles();
      toast(addr.value.trim() ? 'Сервер сохранён — теперь можно поделиться сборкой' : 'Сервер убран из профиля', 'ok');
      render();
      tab = addr.value.trim() ? 'share' : 'server';
      draw();
    };
    return h('div.friends-pane', {},
      h('p.muted', {}, 'Мир живёт на сервере и работает, даже когда тебя нет. Каждый друг заходит сам.'),
      h('div.how', {},
        h('div.how-title', {}, 'Как сделать бесплатный сервер (один раз)'),
        steps(
          h('span', {}, 'Зарегистрируйся на ', h('a', { href: 'https://aternos.org', target: '_blank' }, 'aternos.org'), ' и создай сервер.'),
          `Выбери ту же версию: ${loaderLabel(p.loader)} ${p.mcVersion}${p.loader === 'vanilla' ? '' : ' и поставь те же моды'}.`,
          'В «Options» включи «Cracked» — иначе ники без лицензии не пустит.',
          'Во вкладке «Access» добавь друзей — они смогут сами запускать сервер.',
          'Скопируй адрес сервера и вставь ниже.',
        ),
        h('p.muted.small', {}, 'Совет: включи whitelist и добавь туда ники друзей — с Cracked любой может зайти под чужим ником.'),
      ),
      h('div.field', {}, h('label', {}, 'Адрес сервера'), addr),
      h('div.field', {}, h('label', {}, 'Название в списке'), name),
      h('div.setting-row', {},
        h('div', {}, h('div.setting-label', {}, 'Кнопка «Играть» сразу заходит на сервер'), h('div.muted.small', {}, 'Иначе сервер просто появится в «Сетевой игре»')),
        sw),
      h('button.btn.primary', { onclick: save }, 'Сохранить'),
    );
  };

  // --- код сборки ---
  const shareTab = () => {
    const out = h('textarea.input.code-box', { readonly: true, rows: 4, placeholder: 'Генерирую код…' }) as HTMLTextAreaElement;
    const info = h('p.muted.small');
    const copy = h('button.btn.primary', { disabled: true }, icon('copy', 16), 'Скопировать код') as HTMLButtonElement;
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(out.value);
      toast('Код скопирован — отправь его друзьям', 'ok', 2500);
    });
    guard(() => api.exportProfileCode(p.id)).then(res => {
      if (!res) return;
      out.value = res.code;
      copy.disabled = false;
      info.textContent = res.skipped
        ? `Внимание: ${res.skipped} мод(ов) поставлены вручную, не с Modrinth — их в коде нет, скинь их друзьям файлами.`
        : '';
    });
    return h('div.friends-pane', {},
      h('p.muted', {}, 'В коде: версия, модлоадер, все моды и шейдеры точных версий' + (p.cloud ? ' и доступ к облачному миру.' : p.serverAddress ? ' и адрес сервера.' : '.')),
      p.cloud ? h('p.warn-note.small', {}, 'Код даёт доступ к облачному миру — отправляй только друзьям.') : null,
      out,
      info,
      h('div.row', {}, copy),
      steps('Друг ставит Neon Launcher.', '«Профили» → «Импорт по коду» → вставляет код.', `Жмёт «Играть»${p.cloud ? ' — и попадает в общий мир' : p.autoJoin && p.serverAddress ? ' — и сразу попадает на сервер' : ''}.`),
    );
  };

  draw();
}

function openImport() {
  const input = h('textarea.input.code-box', { rows: 4, placeholder: 'NEON1-…', spellcheck: 'false' }) as HTMLTextAreaElement;
  const status = h('p.muted.small');
  const btn = h('button.btn.primary', {}, 'Создать профиль') as HTMLButtonElement;
  const m = modal('Импорт сборки по коду', h('div.form', {},
    h('p.muted', {}, 'Вставь код, который прислал друг. Появится такой же профиль со всеми модами.'),
    input, status), [
    h('button.btn.ghost', { onclick: () => m.close() }, 'Отмена'),
    btn,
  ]);
  setTimeout(() => input.focus(), 50);
  btn.addEventListener('click', async () => {
    if (!input.value.trim()) return toast('Вставь код', 'error');
    btn.disabled = true;
    const off = api.onProgress(pr => { if (pr) status.textContent = pr.stage; });
    try {
      const res = await api.importProfileCode(input.value);
      state.profiles = await api.listProfiles();
      state.settings = await api.saveSettings({ selectedProfileId: res.profile.id });
      m.close();
      if (res.failed.length) toast(`Профиль создан, но ${res.failed.length} не установилось:\n${res.failed.slice(0, 3).join('\n')}`, 'error', 9000);
      else toast(`Профиль «${res.profile.name}» готов — жми «Играть»`, 'ok');
      go('home');
    } catch (e) {
      status.textContent = '';
      toast((e as Error).message, 'error', 6000);
      btn.disabled = false;
    } finally {
      off();
    }
  });
}

// ======================= НАСТРОЙКИ =======================

function viewSettings(): HTMLElement {
  const s = state.settings;
  const acc = s.account;

  const accountCard = h('section.panel', {},
    h('h3', {}, 'Аккаунт'),
    acc?.type === 'ely'
      ? h('div.account-card', {},
          avatar(acc, 56),
          h('div.grow', {}, h('div.account-big', {}, acc.name), h('div.muted', {}, `Ely.by · ${acc.login}`)),
          h('button.btn.ghost', { onclick: async () => { await guard(() => api.logout()); state.settings = await api.getSettings(); renderShell(); render(); } }, 'Выйти'),
        )
      : h('div', {},
          h('div.account-card', {},
            avatar(acc, 56),
            h('div.grow', {}, h('div.account-big', {}, acc?.name ?? 'Ник не задан'), h('div.muted', {}, 'Оффлайн-режим: одиночная игра и сервера без лицензионной проверки')),
          ),
          elyForm(),
        ),
  );

  const ramMax = Math.max(2048, Math.floor(state.sys.totalMemMb * 0.85 / 512) * 512);
  const ramOut = h('span.mono.ram-out', {}, `${(s.defaultRamMb / 1024).toFixed(1).replace('.0', '')} ГБ`);
  const ram = h('input.range', { type: 'range', min: 1024, max: ramMax, step: 512, value: s.defaultRamMb }) as HTMLInputElement;
  const setFill = () => ram.style.setProperty('--fill', `${((Number(ram.value) - 1024) / (ramMax - 1024)) * 100}%`);
  setFill();
  ram.addEventListener('input', () => { ramOut.textContent = `${(Number(ram.value) / 1024).toFixed(1).replace('.0', '')} ГБ`; setFill(); });
  ram.addEventListener('change', () => saveSetting({ defaultRamMb: Number(ram.value) }));

  const toggleRow = (label: string, hint: string, key: 'showSnapshots' | 'showOld') =>
    h('div.setting-row', {},
      h('div', {}, h('div.setting-label', {}, label), h('div.muted.small', {}, hint)),
      h(`button.switch${s[key] ? '.on' : ''}`, { onclick: () => saveSetting({ [key]: !s[key] } as Partial<Settings>) }, h('span.knob')),
    );

  const afterSelect = h('select.input.compact', { onchange: (e: Event) => saveSetting({ afterLaunch: (e.target as HTMLSelectElement).value as Settings['afterLaunch'] }) },
    h('option', { value: 'hide', selected: s.afterLaunch === 'hide' }, 'Спрятать лаунчер'),
    h('option', { value: 'keep', selected: s.afterLaunch === 'keep' }, 'Оставить открытым'),
    h('option', { value: 'close', selected: s.afterLaunch === 'close' }, 'Закрыть лаунчер'),
  );

  const parallel = h('select.input.compact', { onchange: (e: Event) => saveSetting({ parallelDownloads: Number((e.target as HTMLSelectElement).value) }) },
    ...[4, 8, 16, 32, 64].map(n => h('option', { value: n, selected: s.parallelDownloads === n }, String(n))));

  return h('div', {},
    h('div.page-head', {}, h('div', {}, h('h1', {}, 'Настройки'))),
    h('div.settings-grid', {},
      accountCard,
      h('section.panel', {},
        h('h3', {}, 'Игра'),
        h('div.field', {}, h('label', {}, 'Память для новых профилей ', ramOut), ram),
        h('div.setting-row', {}, h('div.setting-label', {}, 'После запуска игры'), afterSelect),
        toggleRow('Показывать снапшоты', 'Тестовые версии в списке по умолчанию', 'showSnapshots'),
        toggleRow('Показывать альфу и бету', 'Самые первые версии игры (2009–2011)', 'showOld'),
        h('div.setting-row', {}, h('div', {}, h('div.setting-label', {}, 'Потоков загрузки'), h('div.muted.small', {}, 'Больше — быстрее на хорошем интернете')), parallel),
      ),
      h('section.panel', {},
        h('h3', {}, 'О лаунчере'),
        h('div.setting-row', {},
          h('div', {},
            h('div.setting-label', {}, `Neon Launcher ${state.sys.appVersion}${state.sys.portable ? ' · портативный' : ''}`),
            h('div.muted.small', {}, updateStatusText())),
          state.update.status === 'ready'
            ? h('button.btn.primary.sm', { onclick: () => guard(() => api.installUpdate()) }, 'Обновить')
            : state.update.status === 'manual'
              ? h('button.btn.primary.sm', { onclick: () => guard(() => api.openReleases()) }, 'Скачать')
              : h('button.btn.ghost.sm', {
                  disabled: state.update.status === 'checking' || state.update.status === 'downloading',
                  onclick: () => guard(() => api.checkForUpdates()),
                }, icon('refresh', 14), 'Проверить'),
        ),
        state.sys.portable ? h('p.muted.small', {}, 'Портативная версия не обновляется сама — установи лаунчер через Setup, чтобы обновления ставились автоматически.') : null,
      ),
      h('section.panel', {},
        h('h3', {}, 'Файлы'),
        h('p.muted.small.mono.break', {}, state.sys.rootDir),
        h('button.btn.ghost', { onclick: () => guard(() => api.openRootFolder()) }, icon('folder'), 'Открыть папку лаунчера'),
      ),
    ),
  );
}

function elyForm(): HTMLElement {
  const login = h('input.input', { placeholder: 'Ник или e-mail', autocomplete: 'username' }) as HTMLInputElement;
  const pass = h('input.input', { type: 'password', placeholder: 'Пароль', autocomplete: 'current-password' }) as HTMLInputElement;
  const totp = h('input.input', { placeholder: 'Код 2FA', inputmode: 'numeric', maxlength: 6, style: 'display:none' }) as HTMLInputElement;
  const btn = h('button.btn.primary', {}, 'Войти через Ely.by') as HTMLButtonElement;
  const submit = async () => {
    if (!login.value || !pass.value) return toast('Введи логин и пароль Ely.by', 'error');
    btn.disabled = true;
    try {
      await api.loginEly(login.value, pass.value, totp.value || undefined);
      state.settings = await api.getSettings();
      toast(`Вход выполнен: ${state.settings.account?.name}`, 'ok');
      renderShell();
      render();
    } catch (e) {
      if ((e as Error).message === 'NEED_TOTP') {
        totp.style.display = '';
        totp.focus();
        toast('Аккаунт защищён 2FA — введи код из приложения', 'info');
      } else toast((e as Error).message, 'error', 6000);
    } finally {
      btn.disabled = false;
    }
  };
  btn.addEventListener('click', submit);
  for (const i of [login, pass, totp]) i.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') submit(); });
  return h('div.ely', {},
    h('div.ely-head', {}, h('span.ely-logo', {}, 'ely.by'), h('span.muted.small', {}, 'Скины и плащи в игре. Аккаунт бесплатный.')),
    h('div.ely-form', {}, login, pass, totp, btn),
    h('a.link.small', { href: 'https://account.ely.by/register', target: '_blank' }, 'Нет аккаунта? Регистрация на ely.by →'),
  );
}

async function saveSetting(patch: Partial<Settings>) {
  const s = await guard(() => api.saveSettings(patch));
  if (s) {
    state.settings = s;
    if (state.view === 'settings' && !('defaultRamMb' in patch)) render();
  }
}

// ======================= КОНСОЛЬ =======================

const MAX_LOGS = 3000;

function logLine(e: LogEvent): HTMLElement {
  return h(`div.log.${e.level}`, {}, e.line);
}

function viewConsole(): HTMLElement {
  const out = h('div.console#console-out', {}, ...state.logs.map(logLine));
  setTimeout(() => (out.scrollTop = out.scrollHeight), 0);
  return h('div.console-page', {},
    h('div.page-head', {},
      h('div', {}, h('h1', {}, 'Консоль'), h('p.muted', {}, 'Логи лаунчера и игры. Пригодится, если что-то вылетает.')),
      h('div.row', {},
        state.launch.running ? h('button.btn.danger', { onclick: () => guard(() => api.killGame()) }, icon('stop', 14), 'Убить процесс') : null,
        h('button.btn.ghost', {
          onclick: () => {
            navigator.clipboard.writeText(state.logs.map(l => l.line).join('\n'));
            toast('Лог скопирован', 'ok', 1500);
          },
        }, icon('copy', 16), 'Копировать'),
        h('button.btn.ghost', { onclick: () => { state.logs = []; render(); } }, 'Очистить'),
      ),
    ),
    out,
  );
}

function pushLog(e: LogEvent) {
  state.logs.push(e);
  if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
  const out = document.getElementById('console-out');
  if (out) {
    const stick = out.scrollHeight - out.scrollTop - out.clientHeight < 40;
    out.append(logLine(e));
    while (out.childElementCount > MAX_LOGS) out.firstElementChild?.remove();
    if (stick) out.scrollTop = out.scrollHeight;
  }
}

// ======================= старт =======================

function titlebar() {
  const tb = $('#titlebar');
  tb.append(
    h('div.brand', {}, h('span.brand-mark', {}, icon('cube', 16)), h('span.brand-name', {}, 'NEON'), h('span.brand-sub', {}, 'launcher')),
    h('div.win-controls', {},
      h('button.win-btn', { onclick: () => api.windowControl('minimize'), title: 'Свернуть' }, icon('min', 14)),
      h('button.win-btn', { onclick: () => api.windowControl('maximize'), title: 'Развернуть' }, icon('max', 12)),
      h('button.win-btn.close', { onclick: () => api.windowControl('close'), title: 'Закрыть' }, icon('x', 14)),
    ),
  );
}

let progressRaf = 0;

async function boot() {
  titlebar();
  [state.settings, state.sys, state.profiles, state.launch] = await Promise.all([
    api.getSettings(), api.getSystemInfo(), api.listProfiles(), api.getLaunchState(),
  ]);

  api.onLog(pushLog);
  api.onProgress(p => {
    state.progress = p;
    cancelAnimationFrame(progressRaf);
    progressRaf = requestAnimationFrame(updateProgress);
  });
  api.onCloudStatus(text => {
    state.cloudStatus = text;
    cancelAnimationFrame(progressRaf);
    progressRaf = requestAnimationFrame(updateProgress);
  });
  api.onCloudError(text => toast(text, 'error', 10000));
  api.onLaunchState(s => {
    state.launch = s;
    renderShell();
    if (state.view === 'home' || state.view === 'profiles' || state.view === 'console') render();
  });

  api.onUpdate(u => {
    state.update = u;
    renderShell();
    if (state.view === 'settings') render();
  });
  state.update = await api.getUpdateState();

  renderShell();
  render();
  ensureVersions();
}

boot();
