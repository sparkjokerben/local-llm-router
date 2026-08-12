use crate::config::{AuthType, Config, ConfigError, Provider};
use crate::router::Router;
use axum::body::Body;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router as AxumRouter};
use bytes::Bytes;
use futures_util::TryStreamExt;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use subtle::ConstantTimeEq;
use tracing::{info, warn};

/// Client headers forwarded to the upstream provider. Auth headers are never
/// forwarded — the provider's own key replaces them.
const FORWARD_HEADERS: [&str; 4] = ["content-type", "accept", "anthropic-version", "anthropic-beta"];

pub struct AppState {
    pub router: Router,
    pub providers: HashMap<String, Provider>,
    pub client_token: Option<String>,
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(cfg: Config) -> Result<AppState, ConfigError> {
        cfg.validate()?;
        let router = Router::new(cfg.routes);
        let providers = cfg.providers.into_iter().map(|p| (p.id.clone(), p)).collect();
        let http = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| ConfigError::Semantic(format!("failed to build http client: {e}")))?;
        let client_token = cfg.client_token.filter(|t| !t.is_empty());
        Ok(AppState { router, providers, client_token, http })
    }
}

pub fn app(state: AppState) -> AxumRouter {
    AxumRouter::new()
        .route("/health", get(handle_health))
        .route("/v1/models", get(handle_models))
        .route("/v1/messages", post(handle_messages))
        .layer(DefaultBodyLimit::max(32 * 1024 * 1024))
        .with_state(Arc::new(state))
}

#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("invalid config: {0}")]
    Config(#[from] ConfigError),
    #[error("failed to bind {host}:{port}: {source}")]
    Bind { host: String, port: u16, source: std::io::Error },
    #[error("http serve error: {0}")]
    Serve(#[from] std::io::Error),
}

pub async fn run(cfg: Config) -> Result<(), ServerError> {
    serve_until(cfg, shutdown_signal()).await
}

/// Bind and serve until `shutdown` resolves. Used both by the CLI (ctrl-c) and
/// the Tauri app, which stops the gateway with its own oneshot signal.
pub async fn serve_until(
    cfg: Config,
    shutdown: impl std::future::Future<Output = ()> + Send + 'static,
) -> Result<(), ServerError> {
    let state = AppState::new(cfg.clone())?;
    let listener = tokio::net::TcpListener::bind((cfg.host.as_str(), cfg.port))
        .await
        .map_err(|source| ServerError::Bind { host: cfg.host.clone(), port: cfg.port, source })?;
    info!(host = %cfg.host, port = cfg.port, "gateway listening");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(shutdown)
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProbeInfo {
    pub health: bool,
    pub models: Vec<String>,
}

/// Check whether a gateway is reachable on host:port and fetch its routable
/// model list. Used by the Tauri app to report status regardless of whether the
/// gateway runs embedded or externally.
pub async fn probe_status(host: &str, port: u16) -> ProbeInfo {
    let base = format!("http://{host}:{port}");

    let health = match reqwest::get(format!("{base}/health")).await {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    };

    let models = match reqwest::get(format!("{base}/v1/models")).await {
        Ok(r) => match r.text().await {
            Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(v) => v
                    .get("data")
                    .and_then(|d| d.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(str::to_owned))
                            .collect()
                    })
                    .unwrap_or_default(),
                Err(_) => Vec::new(),
            },
            Err(_) => Vec::new(),
        },
        Err(_) => Vec::new(),
    };

    ProbeInfo { health, models }
}

/// Fetch a provider's model list, using the provider's own auth. Anthropic
/// protocol endpoints don't reliably expose a model list, so candidates are
/// tried in order: the configured `models_url`, `{base_url}/v1/models`, and a
/// version with a trailing `/anthropic` stripped (DeepSeek-style, where the
/// OpenAI-compatible list lives on the parent origin).
pub async fn fetch_provider_models(
    base_url: &str,
    api_key: &str,
    auth_type: AuthType,
    models_url: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut candidates: Vec<String> = Vec::new();
    if let Some(mu) = models_url.filter(|s| !s.is_empty()) {
        candidates.push(mu.to_string());
    }
    candidates.push(format!("{}/v1/models", base_url.trim_end_matches('/')));
    if let Some(stripped) = base_url.strip_suffix("/anthropic") {
        candidates.push(format!("{}/v1/models", stripped.trim_end_matches('/')));
    }
    candidates.dedup();

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err: Option<String> = None;
    for url in candidates {
        let mut req = client.get(&url);
        req = match auth_type {
            AuthType::Bearer => req.bearer_auth(api_key),
            AuthType::ApiKey => req.header("x-api-key", api_key),
        };
        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = Some(format!("{url}: {e}"));
                continue;
            }
        };
        if !resp.status().is_success() {
            last_err = Some(format!("{url}: HTTP {}", resp.status()));
            continue;
        }
        let text = match resp.text().await {
            Ok(t) => t,
            Err(e) => {
                last_err = Some(format!("{url}: {e}"));
                continue;
            }
        };
        let ids: Vec<String> = match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(v) => v
                .get("data")
                .and_then(|d| d.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default(),
            Err(e) => {
                last_err = Some(format!("{url}: 响应无法解析 ({e})"));
                continue;
            }
        };
        if !ids.is_empty() {
            return Ok(ids);
        }
        last_err = Some(format!("{url}: 空模型列表"));
    }
    Err(last_err.unwrap_or_else(|| "没有可用的模型列表地址".into()))
}

async fn handle_health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

/// Anthropic-shaped model list aggregating every routable model. Tools such as
/// cc-switch call this to discover which models the gateway can route.
async fn handle_models(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    if let Some(expected) = &state.client_token {
        if let Some(resp) = client_token_error(expected, &headers) {
            return resp;
        }
    }
    let data: Vec<serde_json::Value> = state
        .router
        .models()
        .into_iter()
        .map(|id| serde_json::json!({ "type": "model", "id": id, "display_name": id }))
        .collect();
    (StatusCode::OK, Json(serde_json::json!({ "data": data, "has_more": false }))).into_response()
}

async fn handle_messages(State(state): State<Arc<AppState>>, headers: HeaderMap, body: Bytes) -> Response {
    let started = Instant::now();

    if let Some(expected) = &state.client_token {
        if let Some(resp) = client_token_error(expected, &headers) {
            return resp;
        }
    }

    let parsed: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return error_response(StatusCode::BAD_REQUEST, "invalid_request_error", "request body is not valid JSON");
        }
    };
    let Some(model) = parsed.get("model").and_then(serde_json::Value::as_str).map(str::to_owned) else {
        return error_response(StatusCode::BAD_REQUEST, "invalid_request_error", "model: field required");
    };

    let Some(route) = state.router.route(&model) else {
        return error_response(
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
            &format!("model: unknown model '{model}'"),
        );
    };

    let Some(provider) = state.providers.get(&route.provider) else {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, "api_error", "route provider is not configured");
    };

    let upstream_url = format!("{}/v1/messages", provider.base_url.trim_end_matches('/'));
    let mut req = state.http.post(&upstream_url).body(body);
    for name in FORWARD_HEADERS {
        if let Some(value) = headers.get(name).and_then(|v| v.to_str().ok()) {
            req = req.header(name, value);
        }
    }
    // Force uncompressed responses so the SSE stream stays byte-identical.
    req = req.header(header::ACCEPT_ENCODING, "identity");
    match provider.auth_type {
        AuthType::Bearer => {
            req = req.bearer_auth(&provider.api_key);
        }
        AuthType::ApiKey => {
            req = req.header("x-api-key", &provider.api_key);
        }
    }

    let upstream = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            warn!(provider = %provider.id, error = %e, "upstream request failed");
            return error_response(StatusCode::BAD_GATEWAY, "api_error", "upstream connection failed");
        }
    };

    let status = upstream.status();
    info!(
        model = %model,
        provider = %provider.id,
        status = status.as_u16(),
        latency_ms = started.elapsed().as_millis() as u64,
        "request"
    );

    let mut builder = Response::builder().status(status);
    if let Some(ct) = upstream.headers().get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()) {
        builder = builder.header(header::CONTENT_TYPE, ct);
    }
    if let Some(ra) = upstream.headers().get("retry-after").and_then(|v| v.to_str().ok()) {
        builder = builder.header("retry-after", ra);
    }
    let stream = upstream.bytes_stream().map_err(std::io::Error::other);
    builder
        .body(Body::from_stream(stream))
        .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "api_error", "failed to build response"))
}

/// Returns `Some(response)` to send back if the client token is missing/wrong.
fn client_token_error(expected: &str, headers: &HeaderMap) -> Option<Response> {
    let got = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    let Some(got) = got else {
        return Some(error_response(StatusCode::UNAUTHORIZED, "authentication_error", "missing bearer token"));
    };
    if bool::from(expected.as_bytes().ct_eq(got.as_bytes())) {
        None
    } else {
        Some(error_response(StatusCode::UNAUTHORIZED, "authentication_error", "invalid client token"))
    }
}

fn error_response(status: StatusCode, error_type: &str, message: &str) -> Response {
    let body = serde_json::json!({
        "type": "error",
        "error": { "type": error_type, "message": message }
    });
    (status, Json(body)).into_response()
}
