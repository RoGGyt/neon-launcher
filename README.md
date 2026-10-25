# Neon Launcher

Неоновый Minecraft-лаунчер на Electron + TypeScript. Без рантайм-зависимостей: скачивание, установка и запуск версий написаны с нуля.

- Все версии Minecraft: релизы, снапшоты, старые альфы и беты
- Fabric и Forge (версии лоадера выбираются в профиле)
- Профили со своими папками: миры, моды, конфиги, ресурспаки
- Java ставится сама (рантаймы Mojang: 8, 16, 17, 21…), можно указать свою
- Ползунок RAM, свои JVM-аргументы, размер окна
- Менеджер модов с Modrinth: поиск, установка с зависимостями, вкл/выкл, удаление
- Оффлайн-вход по нику или аккаунт Ely.by (скины в игре через authlib-injector)
- Консоль с логами игры

## Запуск

Нужен Node.js 20+.

```bash
npm install
npm start
```

## Скачать

Готовые exe собираются автоматически при каждом пуше в `main` и лежат в [Releases](../../releases/latest):

- `NeonLauncher-Setup-x.x.x.exe` — установщик; дальше лаунчер обновляется сам
- `NeonLauncher-portable-x.x.x.exe` — без установки (обновляется вручную)

Автообновление: каждая сборка получает версию `1.0.<номер сборки>` и публикуется в Releases вместе с `latest.yml`. Установленный лаунчер проверяет его при старте и раз в 2 часа, тихо качает обновление и ставит его при перезапуске.

## Сборка .exe вручную

```bash
npm run dist
```

Или двойной клик по `build-installer.bat`. В `release/` появятся установщик и портативная версия. Собирать Windows-версию лучше на Windows. Для Linux: `npm run dist:linux` (AppImage), для macOS: `npm run dist:mac`.

## Где лежат файлы

- Windows: `%APPDATA%\.neonlauncher`
- Linux/macOS: `~/.neonlauncher`

```
.neonlauncher/
  versions/    version.json и client.jar каждой версии (общие для всех профилей)
  libraries/   библиотеки
  assets/      звуки, языки, текстуры
  runtime/     скачанная Java
  profiles/<id>/   папка игры профиля (saves, mods, config…)
  settings.json, profiles.json
```

## Структура кода

```
src/main/
  main.ts      окно и IPC
  mojang.ts    манифест версий, наследование inheritsFrom, правила, библиотеки, ассеты
  launch.ts    подготовка профиля и сборка команды запуска
  java.ts      установка Java от Mojang
  loaders.ts   Fabric (meta.fabricmc.net) и Forge (установщик в headless-режиме)
  mods.ts      Modrinth API
  auth.ts      оффлайн-UUID и Ely.by
  net.ts       загрузки с проверкой sha1, параллельность, ретраи
  zip.ts       распаковка нативок без зависимостей
src/preload.ts   безопасный мост window.launcher
src/renderer/    интерфейс (чистый TS, без фреймворков)
static/          index.html и styles.css
```

## Как это работает

1. Лаунчер берёт манифест версий с `piston-meta.mojang.com`.
2. Для профиля скачивает version.json, клиент, библиотеки (по правилам ОС), нативки и ассеты.
3. Fabric/Forge устанавливаются как дочерняя версия с `inheritsFrom`, лаунчер склеивает её с ванилью.
4. Оффлайн-UUID считается так же, как в серверном offline-mode: UUID v3 от `OfflinePlayer:<ник>`.
5. Игра запускается с `-Xmx` из профиля и аргументами из version.json.

## Заметки

- Forge 1.13+ ставится через официальный установщик с флагом `--installClient`, это занимает 1–3 минуты при первом запуске. Очень старые Forge (без установщика) не поддерживаются.
- Сервера с `online-mode=true` пускают только лицензию. С Ely.by можно заходить на сервера, которые используют Ely.by.
- Без купленной копии игра нарушает EULA Mojang. Для публичного распространения добавь вход через Microsoft.
