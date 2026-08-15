use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use std::path::{Path, PathBuf};

pub fn default_host() -> String {
    "127.0.0.1".to_string()
}

pub fn default_port() -> u16 {
    8338
}

fn default_true() -> bool {
    true
}

/// How the provider expects its API key: `Authorization: Bearer` or `x-api-key`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AuthType {
    #[default]
    Bearer,
    ApiKey,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    #[serde(default)]
    pub name: String,
    /// Anthropic-compatible base URL, e.g. `https://api.deepseek.com/anthropic`.
    pub base_url: String,
    pub api_key: String,
    #[serde(default)]
    pub auth_type: AuthType,
    /// Optional model-list URL (usually the provider's OpenAI-compatible
    /// `/v1/models`). When unset, fetching models tries `{base_url}/v1/models`
    /// and a version with a trailing `/anthropic` stripped.
    #[serde(default)]
    pub models_url: Option<String>,
}

// Mask the key in logs / Debug output.
impl fmt::Debug for Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Provider")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("base_url", &self.base_url)
            .field("api_key", &"••••")
            .field("auth_type", &self.auth_type)
            .field("models_url", &self.models_url)
            .finish()
    }
}

/// A routing rule: the model string Claude Code sends -> a provider id.
/// `"*"` is a fallback that matches any model not otherwise matched.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Route {
    pub model: String,
    pub provider: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    /// Optional token Claude Code must send as `Authorization: Bearer`.
    #[serde(default)]
    pub client_token: Option<String>,
    #[serde(default)]
    pub providers: Vec<Provider>,
    #[serde(default)]
    pub routes: Vec<Route>,
    /// 关闭窗口时最小化到系统托盘（默认开启）。
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    /// 登录后开机自启动（默认关闭）。
    #[serde(default)]
    pub auto_start: bool,
}

impl fmt::Debug for Config {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Config")
            .field("host", &self.host)
            .field("port", &self.port)
            .field("client_token", &self.client_token.as_deref().map(|_| "••••"))
            .field("providers", &self.providers)
            .field("routes", &self.routes)
            .finish()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("failed to read {path}: {source}")]
    Io { path: PathBuf, source: std::io::Error },
    #[error("failed to parse {path}: {source}")]
    Parse { path: PathBuf, source: serde_json::Error },
    #[error("{0}")]
    Semantic(String),
}

impl Config {
    pub fn load(path: &Path) -> Result<Config, ConfigError> {
        let text = std::fs::read_to_string(path)
            .map_err(|source| ConfigError::Io { path: path.to_path_buf(), source })?;
        let cfg: Config = serde_json::from_str(&text)
            .map_err(|source| ConfigError::Parse { path: path.to_path_buf(), source })?;
        cfg.validate()?;
        Ok(cfg)
    }

    pub fn save(&self, path: &Path) -> Result<(), ConfigError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)
                .map_err(|source| ConfigError::Io { path: dir.to_path_buf(), source })?;
        }
        let text = serde_json::to_string_pretty(self).expect("serialize config");
        std::fs::write(path, text)
            .map_err(|source| ConfigError::Io { path: path.to_path_buf(), source })
    }

    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.providers.is_empty() {
            return Err(ConfigError::Semantic("no providers configured".into()));
        }
        if self.routes.is_empty() {
            return Err(ConfigError::Semantic("no routes configured".into()));
        }
        let mut ids = HashSet::new();
        for p in &self.providers {
            if !ids.insert(&p.id) {
                return Err(ConfigError::Semantic(format!("duplicate provider id '{}'", p.id)));
            }
            let url = url::Url::parse(&p.base_url)
                .map_err(|e| ConfigError::Semantic(format!("provider '{}' base_url is invalid: {e}", p.id)))?;
            if !matches!(url.scheme(), "http" | "https") {
                return Err(ConfigError::Semantic(format!(
                    "provider '{}' base_url must use http/https",
                    p.id
                )));
            }
        }
        for r in &self.routes {
            if r.model.is_empty() {
                return Err(ConfigError::Semantic("route with empty model".into()));
            }
            if !ids.contains(&r.provider) {
                return Err(ConfigError::Semantic(format!(
                    "route '{}' -> provider '{}' is not defined",
                    r.model, r.provider
                )));
            }
        }
        Ok(())
    }

    pub fn provider(&self, id: &str) -> Option<&Provider> {
        self.providers.iter().find(|p| p.id == id)
    }
}

/// Default config path: `%APPDATA%/local-llm-router/config.json` on Windows.
pub fn default_config_path() -> PathBuf {
    dirs::config_dir()
        .map(|d| d.join("local-llm-router").join("config.json"))
        .unwrap_or_else(|| PathBuf::from("config.json"))
}

/// Minimal template written by `init`.
pub fn sample() -> Config {
    serde_json::from_str(
        r#"{
            "host": "127.0.0.1",
            "port": 8338,
            "client_token": "",
            "providers": [
                { "id": "deepseek", "name": "DeepSeek", "base_url": "https://api.deepseek.com/anthropic", "api_key": "sk-REPLACE-ME", "auth_type": "bearer" }
            ],
            "routes": [
                { "model": "*", "provider": "deepseek" }
            ]
        }"#,
    )
    .expect("sample config is valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_masks_api_key_and_client_token() {
        let cfg: Config = serde_json::from_str(
            r#"{
                "client_token": "tok-123",
                "providers": [{ "id": "p", "name": "P", "base_url": "https://x.com", "api_key": "secret-123", "auth_type": "bearer" }],
                "routes": [{ "model": "m", "provider": "p" }]
            }"#,
        )
        .unwrap();
        let s = format!("{cfg:?}");
        assert!(!s.contains("secret-123"));
        assert!(!s.contains("tok-123"));
        assert!(s.contains("••••"));
    }

    #[test]
    fn validate_rejects_route_to_unknown_provider() {
        let cfg: Config = serde_json::from_str(
            r#"{
                "providers": [{ "id": "p", "name": "P", "base_url": "https://x.com", "api_key": "k", "auth_type": "bearer" }],
                "routes": [{ "model": "m", "provider": "nope" }]
            }"#,
        )
        .unwrap();
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn old_config_without_new_fields_loads_with_defaults() {
        let cfg: Config = serde_json::from_str(
            r#"{
                "host": "127.0.0.1",
                "port": 8338,
                "providers": [{ "id": "p", "name": "P", "base_url": "https://x.com", "api_key": "k" }],
                "routes": [{ "model": "m", "provider": "p" }]
            }"#,
        )
        .unwrap();
        assert!(cfg.close_to_tray);
        assert!(!cfg.auto_start);
    }

    #[test]
    fn validate_rejects_duplicate_provider() {
        let cfg: Config = serde_json::from_str(
            r#"{
                "providers": [
                    { "id": "p", "name": "P", "base_url": "https://x.com", "api_key": "k" },
                    { "id": "p", "name": "P", "base_url": "https://y.com", "api_key": "k" }
                ],
                "routes": [{ "model": "m", "provider": "p" }]
            }"#,
        )
        .unwrap();
        assert!(cfg.validate().is_err());
    }
}
