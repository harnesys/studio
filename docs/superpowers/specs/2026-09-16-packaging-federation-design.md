# Упаковка и федерация: remote-host v1

Date: 2026-09-16
Status: design approved in chat
Scope: упаковка (десктоп x3, self-hosted CLI, Docker) + федерация v1. Вне скоупа: mesh sync, home-host с раннерами (задел B), tunnel кнопкой из UI (пункт 4 упаковки ROADMAP, позже).

## Контекст

ROADMAP (`docs/ROADMAP.md`) описывает стол агентов на машине пользователя или его VPS: агент привязан к папке, ход пишется в `~/.harnesys/studio.db`, ключи на хосте. Сегодня `apps/studio/server/src/index.ts` раздаёт API и `client/dist` одним процессом Bun. Демона, tray, автозапуска, pairing нет.

## Решение

Подход A (remote-host) как v1. Агент живёт там, где его папка и `studio.db`. Окно подключается к любому хосту. Подход B (home-host с раннерами) — задел, протокол раннера позже. Подход C (mesh sync) — отложен.

## Архитектура

Один бинарь, два режима:

- `host`: runtime, persist, cron, вебхуки, HITL-gate. Фон, старт с логином ОС. UI нет.
- `window`: чат, файлы, инспектор, inbox. Закрытие окна хост не останавливает.

Миграции агентов между хостами в v1 нет. Общей БД между хостами нет.

## Компоненты

- Идентичность хоста: id, имя, pairing-токен.
- Реестр хостов в окне: список, добавление по коду, удаление.
- Pairing: новый хост показывает код, подтверждение на доверенном окне, дальше токен. Локальный loopback без трения, удалённый только после approve.
- Статус хоста: `online/offline` в UI.
- Inbox: агрегация `awaiting_confirm` и `awaiting_input` со всех доступных хостов. Недоступный хост помечается, его запросы не теряются.

## Поток данных

Окно ходит в API выбранного хоста, стрим шагов идёт по существующему каналу событий (`deskEvents`). Confirm уходит на тот хост, где ждёт run. Cron и тикеры срабатывают локально на каждом хосте (`schedule-ticker`, `wait-ticker`). После сна хост поднимает paused HITL и догоняет очередь (`run-claimer`, `run-lifecycle-store`).

## Ошибки и границы

Офлайн-хост не блокирует остальные. Конфликтов записей нет: запись принадлежит своему хосту. Секреты (ключи провайдеров, MCP env, tunnel token) хранятся только на своём хосте. Доступ наружу на старте: Tailscale/SSH. Кнопка tunnel из UI — позже.

## UX: сайдбар и workspace (согласовано на мокапе `sidebar-mockup.html`)

- Шапка сайдбара: ряд до 4 табов-аватаров слева, справа ⋯. Меню: New workspace + невместившиеся workspace. Позже в меню добавятся пункты.
- Мультиселект табов (shift/control): секции показывают группы всех выбранных workspace с разделителем (имя + count). Single-select остаётся дефолтом.
- Explorer: корень верхнего уровня равен workspace, раскрываются независимо. Git: группа равна workspace с веткой и счётом (`[main] • 3 ↑1 ↓0`), заголовок секции держит суммарный счёт. Agents и Automations: разделители-группы, сортировка внутри группы.
- Inbox: первая секция, раскрыта. Строки `awaiting_confirm`/`awaiting_input`: заголовок + агент и время, статус waiting. Группы по workspace.
- New workspace: одна форма без табов. Поля: Хост → Имя → Каталог. Имя по умолчанию равно имени каталога. Локальный каталог через picker, удалённый текстом. Пункт «Подключить новый хост» раскрывает связку в той же форме: адрес + код с `harnesys host pair` (10 минут, одна попытка). Успех добавляет хост в список и выбирает его.

## Упаковка

Принцип: клиент и сервер всегда разные процессы. Host слушает loopback (или 0.0.0.0 за reverse proxy), окно ходит в API по HTTP+WS с Bearer-токеном pairing. Токен локального хоста лежит в `~/.harnesys/host.token` (0600). Раздача `client/dist` тем же процессом, что API, запрещена: за статику отвечает отдельный процесс.

Артефакты сборки из этого репо:

- `harnesys-host`: `bun build --compile server/src/index.ts`. Только API, WS, cron, вебхуки, SQLite. Миграции drizzle при старте.
- `harnesys-web`: отдельный маленький entry, только раздача `client/dist` и reverse-proxy `/api` и `/ws` на host. Нужен для VPS с UI и Docker, на десктопе не используется.
- `harnesys`: CLI-супервизор. Команды: `up`, `down`, `logs`, `update`, `host pair`, `up --install-systemd`.

Десктоп (Tauri 2.0, сначала macOS aarch64):

- `src-tauri`: sidecar `binaries/harnesys-host-<triple>` через `bundle.externalBin`, запуск и останов хоста в Rust на setup/exit, порт и путь к токену через args/env. Capability `shell:allow-execute` с `sidecar: true`.
- Фронт: существующий Vite-билд client без изменений логики, API base указывает на loopback-порт sidecar.
- Плагины: tray (открыть стол, счётчики running/awaiting, выход останавливает окно и хост), autostart (`MacosLauncher::LaunchAgent`), single-instance, opener.
- `.dmg` через bundler Tauri. Подпись Apple Developer ID и notarization обязательны, иначе Gatekeeper. CI собирает через `tauri-action`.
- Закрытие окна хост не останавливает. Реестр хостов из раздела Компоненты работает как в мокапе: локальный sidecar просто хост по умолчанию.
- Windows (msi) и Linux (AppImage), brew cask: после живого macOS.

VPS CLI:

- `curl -fsSL https://harnesys.dev/install | sh` кладёт `harnesys`, `harnesys-host`, `harnesys-web` в `~/.local/bin`.
- `harnesys up [--with-ui] [--port 3000] [--web-port 8080]`: запускает host (+ web), pidfiles и логи в `~/.harnesys/`, healthcheck `/health` перед `ok`.
- TTY без флагов: интерактивное меню (режим, порты, systemd). Флаги или нет TTY: полностью неинтерактивно для скриптов и панелей.
- `up --install-systemd`: два юнита (`harnesys-host`, `harnesys-web`), `enable --now`, рестарт после ребута.
- `harnesys host pair`: код 6 цифр на 10 минут. `harnesys update`: релиз с GitHub releases + рестарт. TLS снаружи: Caddy панели или свой reverse proxy.

Docker compose (Dokploy, Coolify):

- Сервисы: `host` (`ghcr.io/harnesys/host`, volume `harnesys-data`, env `PORT`, `HOST_TOKEN`, `PUBLIC_URL`, healthcheck `/health`) и `web` (`ghcr.io/harnesys/web`, `depends_on host`, env `UPSTREAM=http://host:3000`, expose 80). Ingress панели смотрит на `web:80`.
- `.env.example` в репо. Теги образов по релизу + `latest`. Миграции выполняет host при старте.

## Приёмка v1

- Два хоста в реестре, переключение окна между ними, тред продолжается там, где его файлы.
- Офлайн одного хоста виден в UI, второй работает.
- Cron на VPS срабатывает без открытого окна, необратимое приходит в inbox.
- Confirm с телефона доходит до run на VPS.
- Незнакомый человек ставится без клона и за три минуты получает первый ход (критерий ROADMAP).
- Упаковка: dmg ставится на чистой macOS, окно открывается без терминала, хост живёт после закрытия окна, автозапуск после ребута. VPS: `curl | sh` + `harnesys up --with-ui` даёт UI за 5 минут. Compose поднимается двумя сервисами, данные переживают пересоздание.

## Самопроверка спека

- Плейсхолдеров нет: все компоненты маппятся на существующие модули или названные новые (pairing, реестр хостов).
- Противоречий нет: привязка агента к папке сохранена, общей БД нет, inbox агрегирующий.
- Скоуп один: remote-host v1 + UX мокапа + упаковка из трёх носителей. Раннеры, mesh, tunnel кнопкой исключены явно.
- Неоднозначность закрыта: миграций нет, секреты не ездят по сети кроме pairing, статика отдельным процессом.
