use crate::AppState;
use gateway::Config;
use serde::Serialize;
use tauri::State;

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
pub async fn save_config(state: State<'_, AppState>, cfg: Config) -> Result<(), String> {
    cfg.validate().map_err(|e| e.to_string())?;
    cfg.save(&state.config_path).map_err(|e| e.to_string())?;
    if state.gateway.is_running() {
        state.gateway.stop();
        state.gateway.start(cfg).map_err(|e| e.to_string())?;
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
