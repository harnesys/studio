# Harnesys Desktop

Tauri-оболочка вокруг webui (`apps/webui`). Своего фронтенда нет: дев и прод берут SPA из webui.

- Дев: `bun run dev:desktop` из корня — поднимает vite webui (:5173) и окно Tauri.
- Прод: `bun run build:client`, затем `bun run --cwd apps/desktop build` — `frontendDist` смотрит в `../webui/dist`.

Референс обвязки (version bump, иконки, настройки): `~/Projects/LangSwitcher/langswitcher` — не перенесено, по мере нужды.
