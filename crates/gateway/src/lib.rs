//! Local LLM routing gateway: forwards Anthropic Messages requests from Claude
//! Code to whichever provider handles the requested model, swapping the auth
//! header and forwarding the body verbatim (no request/response rewriting).

pub mod ccswitch;
pub mod config;
pub mod router;
pub mod server;

pub use ccswitch::build_import_url;
pub use config::{AuthType, Config, ConfigError, Provider, Route, default_config_path, sample};
pub use router::Router;
pub use server::{run, serve_until, AppState, ProbeInfo, ServerError, fetch_provider_models, probe_status};
