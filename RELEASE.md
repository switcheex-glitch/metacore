# Релиз и автообновления

## Как это работает

1. **CI** ловит push тэга `vX.Y.Z`, билдит инсталляторы под Windows / macOS / Linux,
   создаёт GitHub Release и заливает туда артефакты:
   - `Metacore-Setup.exe` + `RELEASES` + `*.nupkg` (Windows / Squirrel)
   - `Metacore.dmg` + `*.zip` (macOS)
   - `metacore_*.deb` (Linux)
2. У установленного Metacore раз в час срабатывает `update-electron-app`. Он
   опрашивает `update.electronjs.org` (бесплатный прокси к GitHub Releases от
   команды Electron) → находит новую версию → Squirrel в фоне скачивает
   дельта-патч.
3. Когда патч готов, в окне приложения появляется баннер **«Доступно
   обновление — Установить и перезапустить»**. Нажатие = `quitAndInstall()` —
   приложение закрывается, Squirrel применяет патч за пару секунд, Metacore
   перезапускается на новой версии. Без переустановки.

## Что я уже добавил в репозиторий

- `forge.config.ts` — `@electron-forge/publisher-github`, репо `metacore-ltd/metacore`.
- `package.json` — `repository`, `devDep` `@electron-forge/publisher-github`,
  скрипты `release:patch / minor / major`.
- `.github/workflows/release.yml` — на тэг `v*` или ручной dispatch собирает
  3 платформы и публикует.
- `src/main.ts` — `setupAutoUpdater()` подключает `update-electron-app` к
  `update.electronjs.org`, шлёт состояние в renderer через IPC `update:state`.
- `src/components/update-banner.tsx` — баннер «Доступно обновление» с кнопкой.

## Что нужно сделать тебе один раз

### 1. Создать GitHub-репозиторий

В консоли:

```bash
git init
git add -A
git commit -m "initial"
gh repo create metacore-ltd/metacore --public --source=. --push
```

Если организации `metacore-ltd` нет — создай её (или поменяй имя в `package.json:repository.url` и `forge.config.ts:publishers[0].repository`).

### 2. Если репо приватный — добавь PAT

CI использует `GITHUB_TOKEN` который GitHub Actions выдаёт автоматически.
Для приватного репо его прав хватит. Для публичного с приватным форком —
тоже. Действий не нужно.

### 3. Code-signing для Windows (опционально, но желательно)

Без подписи Windows SmartScreen при первой установке покажет «неизвестный
издатель». Обновления продолжат работать, но юзерам страшно.

Когда купишь сертификат:

1. Закодируй `.pfx` файл в base64 и положи в GitHub Secret
   `WINDOWS_CERTIFICATE_FILE`.
2. Пароль от сертификата — в `WINDOWS_CERTIFICATE_PASSWORD`.
3. Раскомментируй соответствующие строки в `.github/workflows/release.yml`
   и добавь параметры в `forge.config.ts → makers → MakerSquirrel`:
   ```ts
   new MakerSquirrel({
     name: "Metacore",
     setupExe: "Metacore-Setup.exe",
     certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
     certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
   })
   ```

### 4. Notarization для macOS (опционально)

Apple требует подпись + нотаризацию для распространения вне App Store.
Если не подписывать, юзер должен в System Settings явно разрешить запуск.

Когда подключишься к Apple Developer:

1. В GitHub Secrets положи `APPLE_ID`, `APPLE_ID_PASSWORD` (app-specific
   password), `APPLE_TEAM_ID`.
2. Раскомментируй в `release.yml` и пропиши в `packagerConfig`:
   ```ts
   osxSign: {},
   osxNotarize: {
     appleId: process.env.APPLE_ID!,
     appleIdPassword: process.env.APPLE_ID_PASSWORD!,
     teamId: process.env.APPLE_TEAM_ID!,
   },
   ```

## Workflow выпуска новой версии

```bash
# что-то поменял в коде, готов выкатить
git commit -am "fix: что-то починил"
npm run release:patch    # 0.1.0 → 0.1.1, push с тэгом
# или: release:minor (0.1.0 → 0.2.0), release:major (0.1.0 → 1.0.0)
```

CI поймает тэг, через 5–10 минут на странице Releases появится новый релиз.
У всех уже установленных Metacore через ≤1 час всплывёт баннер.

## Отладка

- **Логи апдейтера** в консоли main-процесса (видно при `npm start`).
- В dev-режиме (`npm start`) автоапдейтер выключен — `app.isPackaged === false`.
- Если CI падает — смотри Actions tab в GitHub.
- Если у юзера баннер не появляется:
  - Проверь что репо публичный (`update.electronjs.org` работает только с
    публичными).
  - Проверь что есть Release с `RELEASES` файлом и `*.nupkg`.
  - Версия в новом релизе должна быть **выше** установленной (semver).
  - Юзер может ручкой вызвать проверку — IPC `update:check` (можно повесить
    кнопку «Проверить обновления» в Settings, скажи если нужно).

## Приватный репо вместо публичного

Если хочешь приватный — `update.electronjs.org` не подойдёт. Варианты:

1. **Свой сервер обновлений** — `nuts`, `electron-release-server` или
   собственный endpoint в Supabase Edge Functions.
2. **Hazel** (Vercel-friendly, читает приватный репо через PAT).

В обоих случаях надо поменять `updateSource` в `setupAutoUpdater()`:

```ts
updateElectronApp({
  updateSource: {
    type: UpdateSourceType.StaticStorage,
    baseUrl: "https://updates.metacore.ltd/v1/win32/x64",
  },
  ...
});
```
