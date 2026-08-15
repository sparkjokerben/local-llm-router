pub mod commands;
pub mod gateway_host;
pub mod logs;

use gateway::default_config_path;
use logs::LogBuffer;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub gateway: gateway_host::GatewayHost,
    pub config_path: PathBuf,
    pub logs: LogBuffer,
    pub close_to_tray: AtomicBool,
    pub auto_start: AtomicBool,
    /// 托盘图标必须存住，drop 后图标会消失。
    pub tray: Mutex<Option<tauri::tray::TrayIcon<tauri::Wry>>>,
}

pub fn run() {
    let logs = logs::setup();
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(AppState {
            gateway: gateway_host::GatewayHost::new(),
            config_path: default_config_path(),
            logs,
            close_to_tray: AtomicBool::new(true),
            auto_start: AtomicBool::new(false),
            tray: Mutex::new(None),
        })
        .setup(setup)
        .on_window_event(|window, event| {
            // 关窗拦截：仅当「关闭时最小化到托盘」开启时隐藏窗口而非销毁进程。
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<AppState>();
                if state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::start_gateway,
            commands::stop_gateway,
            commands::get_status,
            commands::import_ccswitch,
            commands::get_logs,
            commands::fetch_provider_models,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 启动后装配：同步运行设置、应用开机自启、创建系统托盘。
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri_plugin_autostart::ManagerExt;

    let handle = app.handle();

    // 把 config 里的运行设置同步进 AppState，并按需应用开机自启。
    let (close_to_tray, auto_start) = match gateway::Config::load(&default_config_path()) {
        Ok(c) => (c.close_to_tray, c.auto_start),
        Err(_) => (true, false),
    };
    let app_state = handle.state::<AppState>();
    app_state.close_to_tray.store(close_to_tray, Ordering::Relaxed);
    app_state.auto_start.store(auto_start, Ordering::Relaxed);
    if auto_start {
        let _ = handle.autolaunch().enable();
    }

    // 托盘：左键点击显示窗口，右键出菜单；「退出」走 RunEvent::Exit 绕过关窗拦截。
    let show = MenuItem::with_id(handle, "show", "打开主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&show, &quit])?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(handle.default_window_icon().expect("app icon").clone())
        .tooltip("LLM Router")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_window(app),
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
                show_window(tray.app_handle());
            }
        })
        .build(handle)?;

    *app_state.tray.lock().unwrap() = Some(tray);
    Ok(())
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
