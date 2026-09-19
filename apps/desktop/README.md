# Harnesys Desktop

Tauri-оболочка вокруг webui (`apps/webui`). Своего фронтенда нет: дев и прод берут SPA из webui.

- Дев: `bun run dev:desktop` из корня — поднимает сервер (:3000), vite webui (:5173, через tauri beforeDevCommand) и окно Tauri. Для работы только в браузере — `bun run dev`.
- Прод: `bun run build:client`, затем `bun run --cwd apps/desktop build` — `frontendDist` смотрит в `../webui/dist`.

Референс обвязки (version bump, иконки, настройки): `~/Projects/LangSwitcher/langswitcher` — не перенесено, по мере нужды.
