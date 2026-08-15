//! Build `ccswitch://` deep-link import URLs. cc-switch's official one-click
//! import path: opening the link makes cc-switch show a confirmation dialog
//! with a preview, then writes the provider to its own storage — we never touch
//! its database directly.
//!
//! The provider points at the local gateway. Model-tier mappings (haiku /
//! sonnet / opus / fable -> model id) are intentionally NOT prefilled: the user
//! fills them in cc-switch's UI, choosing from the models the gateway exposes
//! via its `/v1/models` endpoint.

use crate::config::Config;
use url::form_urlencoded;

pub fn build_import_url(cfg: &Config) -> String {
    let api_key = cfg.client_token.as_deref().filter(|s| !s.is_empty()).unwrap_or("gateway");
    let mut q = form_urlencoded::Serializer::new(String::new());
    q.append_pair("resource", "provider");
    q.append_pair("app", "claude");
    q.append_pair("name", "本地网关");
    q.append_pair("endpoint", &format!("http://{}:{}", cfg.host, cfg.port));
    q.append_pair("apiKey", api_key);
    format!("ccswitch://v1/import?{}", q.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AuthType, Provider, Route};

    fn cfg() -> Config {
        Config {
            host: "127.0.0.1".into(),
            port: 8338,
            client_token: Some("tok-1".into()),
            providers: vec![Provider {
                id: "deepseek".into(),
                name: "DeepSeek".into(),
                base_url: "https://api.deepseek.com/anthropic".into(),
                api_key: "sk-x".into(),
                auth_type: AuthType::Bearer,
                models_url: None,
            }],
            routes: vec![Route { model: "deepseek-v4-flash".into(), provider: "deepseek".into() }],
            close_to_tray: true,
            auto_start: false,
        }
    }

    #[test]
    fn builds_import_url() {
        let url = build_import_url(&cfg());
        assert!(url.starts_with("ccswitch://v1/import?"));
        assert!(url.contains("resource=provider"));
        assert!(url.contains("app=claude"));
        assert!(url.contains("endpoint=http%3A%2F%2F127.0.0.1%3A8338"));
        assert!(url.contains("apiKey=tok-1"));
        // 本地网关 percent-encoded
        assert!(url.contains("name=%E6%9C%AC%E5%9C%B0%E7%BD%91%E5%85%B3"));
    }

    #[test]
    fn falls_back_to_gateway_key_without_client_token() {
        let mut c = cfg();
        c.client_token = Some(String::new());
        assert!(build_import_url(&c).contains("apiKey=gateway"));
    }
}
