use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, UserAttentionType, WindowEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const HOST_ADDR: SocketAddr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 47474));

fn host_alive() -> bool {
    TcpStream::connect_timeout(&HOST_ADDR, Duration::from_millis(300)).is_ok()
}

struct HostProcess(Mutex<Option<CommandChild>>);

/// Bundled skills/presets live in the resource dir for packaged builds
/// (`Contents/Resources/assets`). Returned only when it actually exists —
/// in dev builds the resource dir holds no assets and the host falls back
/// to its own resolution.
fn bundled_assets_env(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?.join("assets");
    dir.is_dir().then_some(dir)
}

/// Spawn the bundled host sidecar unless a host already listens on the port
/// (dev server or CLI-managed host — the window talks to whichever is there).
fn spawn_host(app: &AppHandle) -> Result<(), String> {
    if host_alive() {
        return Ok(());
    }
    let mut command = app
        .shell()
        .sidecar("harnesys-host")
        .map_err(|e| e.to_string())?;
    if let Some(dir) = bundled_assets_env(app) {
        command = command.env("HARNESYS_BUNDLED_ASSETS", dir.to_string_lossy().to_string());
    }
    let (_rx, child) = command.spawn().map_err(|e| e.to_string())?;
    app.state::<HostProcess>()
        .0
        .lock()
        .unwrap()
        .replace(child);
    Ok(())
}

fn wait_host(timeout_ms: u64) -> bool {
    for _ in 0..(timeout_ms / 200) {
        if host_alive() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    host_alive()
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Harnesys", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Harnesys", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))
        .unwrap_or_else(|_| tauri::image::Image::new(&[0, 0, 0, 255], 1, 1));

    let builder = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Harnesys")
        .menu(&menu)
        .show_menu_on_left_click(false);
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|window, event| {
            // Close hides to tray; Quit lives in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(HostProcess(Mutex::new(None)));
            build_tray(&handle)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.request_user_attention(Some(UserAttentionType::Critical));
            }
            if let Err(e) = spawn_host(&handle) {
                eprintln!("host sidecar: {e}");
            }
            std::thread::spawn(move || {
                wait_host(10_000);
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || show_main(&h));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // macOS dock icon click while the window is hidden.
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main(app),
            RunEvent::Exit => {
                if let Some(child) = app.state::<HostProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
            _ => {}
        });
}
