pub mod commands;
pub mod gateway_host;
pub mod logs;

use gateway::default_config_path;
use logs::LogBuffer;
use std::path::PathBuf;

pub struct AppState {
    pub gateway: gateway_host::GatewayHost,
    pub config_path: PathBuf,
    pub logs: LogBuffer,
}

pub fn run() {
    let logs = logs::setup();
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            gateway: gateway_host::GatewayHost::new(),
            config_path: default_config_path(),
            logs,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
