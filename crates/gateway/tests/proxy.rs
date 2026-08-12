//! End-to-end tests: spin a fake upstream axum server, run the gateway app
//! against it in-process, and assert routing + auth swap + verbatim passthrough.

use axum::body::Body;
use axum::extract::Request as AxumRequest;
use axum::http::{HeaderMap, Request, StatusCode, header};
use axum::routing::post;
use axum::{Json, Router};
use bytes::Bytes;
use gateway::server::app;
use gateway::{AppState, AuthType, Config, Provider, Route};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

/// Fake upstream that echoes which auth it received and the request model.
async fn spawn_fake_upstream() -> std::net::SocketAddr {
    let router = Router::new().route(
        "/v1/messages",
        post(|headers: HeaderMap, body: Bytes| async move {
            let seen_bearer = headers
                .get(header::AUTHORIZATION)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
                .unwrap_or_default();
            let seen_api_key = headers
                .get("x-api-key")
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
                .unwrap_or_default();
            let model = serde_json::from_slice::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| v.get("model").and_then(|m| m.as_str()).map(str::to_owned))
                .unwrap_or_default();
            let resp = json!({
                "model": model,
                "seen_bearer": seen_bearer,
                "seen_api_key": seen_api_key,
                "text": "hi from upstream"
            });
            (StatusCode::OK, Json(resp))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    addr
}

fn state(base: &str, routes: Vec<(&str, &str)>) -> AppState {
    let providers = vec![
        Provider { id: "up1".into(), name: "up1".into(), base_url: base.into(), api_key: "key-aaa".into(), auth_type: AuthType::Bearer, models_url: None },
        Provider { id: "up2".into(), name: "up2".into(), base_url: base.into(), api_key: "key-bbb".into(), auth_type: AuthType::ApiKey, models_url: None },
    ];
    let routes = routes
        .into_iter()
        .map(|(model, provider)| Route { model: model.into(), provider: provider.into() })
        .collect();
    let cfg = Config { host: "127.0.0.1".into(), port: 0, client_token: None, providers, routes };
    AppState::new(cfg).unwrap()
}

fn send(model: &str, auth: &str) -> Request<Body> {
    let body = json!({ "model": model, "max_tokens": 1, "messages": [] }).to_string();
    Request::builder()
        .method("POST")
        .uri("/v1/messages")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, auth)
        .header("anthropic-version", "2023-06-01")
        .body(Body::from(body))
        .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn routes_model_to_provider_and_swaps_auth() {
    let addr = spawn_fake_upstream().await;
    let gw = app(state(
        &format!("http://{addr}"),
        vec![("model-a", "up1"), ("model-b", "up2"), ("*", "up1")],
    ));

    // model-a -> up1 (bearer); the client's own bearer must be replaced, not forwarded.
    let resp = gw.clone().oneshot(send("model-a", "Bearer client-tok")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let v: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["model"], "model-a");
    assert_eq!(v["seen_bearer"], "Bearer key-aaa");
    assert_eq!(v["seen_api_key"], "");

    // model-b -> up2 (x-api-key)
    let resp = gw.clone().oneshot(send("model-b", "Bearer client-tok")).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(v["model"], "model-b");
    assert_eq!(v["seen_api_key"], "key-bbb");
    assert_eq!(v["seen_bearer"], "");

    // unknown model falls back to up1
    let resp = gw.clone().oneshot(send("whatever", "Bearer x")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn streams_sse_verbatim() {
    const SSE: &str = concat!(
        "event: message_start\n",
        "data: {\"type\":\"message_start\",\"message\":{\"model\":\"model-x\"}}\n\n",
        "event: message_stop\n",
        "data: {\"type\":\"message_stop\"}\n\n"
    );
    let router = Router::new().route(
        "/v1/messages",
        post(|_: AxumRequest| async move { (StatusCode::OK, [("content-type", "text/event-stream")], SSE.to_string()) }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });

    let gw = app(state(&format!("http://{addr}"), vec![("model-x", "up1"), ("*", "up1")]));
    let resp = gw.oneshot(send("model-x", "Bearer x")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(resp.headers().get(header::CONTENT_TYPE).unwrap(), "text/event-stream");
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[..], SSE.as_bytes());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn rejects_wrong_client_token() {
    let addr = spawn_fake_upstream().await;
    let base = format!("http://{addr}");
    let providers = vec![Provider { id: "up1".into(), name: "up1".into(), base_url: base, api_key: "key-aaa".into(), auth_type: AuthType::Bearer, models_url: None }];
    let routes = vec![Route { model: "m".into(), provider: "up1".into() }];
    let cfg = Config { host: "127.0.0.1".into(), port: 0, client_token: Some("secret".into()), providers, routes };
    let gw = app(AppState::new(cfg).unwrap());

    let resp = gw.clone().oneshot(send("m", "Bearer wrong")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    let req = Request::builder()
        .method("POST")
        .uri("/v1/messages")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(json!({ "model": "m", "messages": [] }).to_string()))
        .unwrap();
    let resp = gw.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    let resp = gw.oneshot(send("m", "Bearer secret")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn unknown_model_without_fallback_returns_400() {
    let addr = spawn_fake_upstream().await;
    let gw = app(state(&format!("http://{addr}"), vec![("model-a", "up1")]));
    let resp = gw.oneshot(send("nope", "Bearer x")).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn lists_routable_models_for_discovery() {
    let addr = spawn_fake_upstream().await;
    let gw = app(state(
        &format!("http://{addr}"),
        vec![("model-a", "up1"), ("model-b", "up2"), ("*", "up1")],
    ));
    let resp = gw
        .oneshot(Request::builder().uri("/v1/models").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let v: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let ids: Vec<&str> = v["data"].as_array().unwrap().iter().map(|m| m["id"].as_str().unwrap()).collect();
    assert_eq!(ids, vec!["model-a", "model-b"]);
}
