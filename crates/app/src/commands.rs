use crate::AppState;
use gateway::Config;
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::State;
use tauri_plugin_autostart::ManagerExt;

#[derive(Serialize)]
pub struct StatusInfo {
    pub host: String,
    pub port: u16,
    pub embedded: bool,
    pub reachable: bool,
    pub models: Vec<String>,
}

/// Load the current config. `None` when the config file doesn't exist yet.
#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<Option<Config>, String> {
    if !state.config_path.exists() {
        return Ok(None);
    }
    Config::load(&state.config_path).map(Some).map_err(|e| e.to_string())
}

/// Validate + persist config; restart the embedded gateway if it is running.
#[tauri::command]
pub async fn save_config(state: State<'_, AppState>, app: tauri::AppHandle, cfg: Config) -> Result<(), String> {
    cfg.validate().map_err(|e| e.to_string())?;
    cfg.save(&state.config_path).map_err(|e| e.to_string())?;
    sync_settings(&app, &state, &cfg)?;
    if state.gateway.is_running() {
        state.gateway.stop();
        state.gateway.start(cfg).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 只改「运行设置」两个字段。不 validate、不重启网关（空配置时开关也能生效）。
/// 文件缺失时用 sample 兜底；文件存在但损坏时直接报错，避免覆盖用户数据。
#[tauri::command]
pub fn save_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    close_to_tray: bool,
    auto_start: bool,
) -> Result<(), String> {
    let mut cfg = if state.config_path.exists() {
        Config::load(&state.config_path).map_err(|e| e.to_string())?
    } else {
        gateway::sample()
    };
    cfg.close_to_tray = close_to_tray;
    cfg.auto_start = auto_start;
    cfg.save(&state.config_path).map_err(|e| e.to_string())?;
    sync_settings(&app, &state, &cfg)
}

/// 把运行设置同步进内存状态；开机自启仅在值变化时才写 OS，
/// 避免每次保存路由都写注册表，也避免 autostart 后端报错拖垮路由保存。
fn sync_settings(app: &tauri::AppHandle, state: &AppState, cfg: &Config) -> Result<(), String> {
    state.close_to_tray.store(cfg.close_to_tray, Ordering::Relaxed);
    if state.auto_start.swap(cfg.auto_start, Ordering::Relaxed) != cfg.auto_start {
        let r = if cfg.auto_start {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        r.map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Start the embedded gateway (called by the UI on launch).
#[tauri::command]
pub async fn start_gateway(state: State<'_, AppState>) -> Result<(), String> {
    let cfg = Config::load(&state.config_path).map_err(|e| e.to_string())?;
    state.gateway.start(cfg)
}

#[tauri::command]
pub async fn stop_gateway(state: State<'_, AppState>) -> Result<(), String> {
    state.gateway.stop();
    Ok(())
}

/// Probe the gateway over HTTP and report status + the routable model list.
#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> Result<StatusInfo, String> {
    let (host, port) = match Config::load(&state.config_path) {
        Ok(c) => (c.host, c.port),
        Err(_) => ("127.0.0.1".to_string(), 8338),
    };
    let embedded = state.gateway.is_running();
    let probe = gateway::probe_status(&host, port).await;
    Ok(StatusInfo { host, port, embedded, reachable: probe.health, models: probe.models })
}

/// Build the cc-switch deep-link URL and open it (cc-switch shows a confirm
/// dialog before importing). Returns the URL so the UI can display it too.
#[tauri::command]
pub fn import_ccswitch(state: State<AppState>) -> Result<String, String> {
    let cfg = Config::load(&state.config_path).map_err(|e| e.to_string())?;
    let url = gateway::build_import_url(&cfg);
    open_url(&url).map_err(|e| e.to_string())?;
    Ok(url)
}

#[tauri::command]
pub fn get_logs(state: State<AppState>) -> Vec<String> {
    state.logs.lock().unwrap().iter().cloned().collect()
}

/// Fetch a provider's model list (route-config helper). Tries the provider's
/// configured `models_url`, then common `/v1/models` candidates.
#[tauri::command]
pub async fn fetch_provider_models(
    base_url: String,
    api_key: String,
    auth_type: gateway::AuthType,
    models_url: Option<String>,
) -> Result<Vec<String>, String> {
    gateway::fetch_provider_models(&base_url, &api_key, auth_type, models_url.as_deref()).await
}

fn open_url(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .arg("url.dll,FileProtocolHandler")
            .arg(url)
            .spawn()?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
    Ok(())
}
