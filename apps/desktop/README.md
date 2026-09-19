# Harnesys Desktop

Tauri-оболочка вокруг webui (`apps/webui`). Своего фронтенда нет: дев и прод берут SPA из webui.

Хост-сервер идёт внутри приложения как sidecar (`bundle.externalBin`): при старте Rust поднимает `harnesys-host` на `127.0.0.1:47474`; если порт уже занят живым хостом (dev или CLI) — использует его. При выходе из приложения sidecar-хост останавливается.

- Дев: `bun run dev:desktop` из корня — сервер из исходников (:47474), vite webui (:5173), окно Tauri.
- Прод: `bun run build:desktop` — сборка host-бинаря, staging sidecar, `tauri build --bundles dmg`; окно открывается, когда host отвечает.
- Скрытие окна в трей (иконка, меню Open/Quit); полный выход — Quit в меню трея.

Референс обвязки (version bump, иконки, настройки): `~/Projects/LangSwitcher/langswitcher` — не перенесено, по мере нужды.
