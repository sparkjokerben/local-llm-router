use clap::{Parser, Subcommand};
use gateway::{AuthType, Config, default_config_path};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser)]
#[command(name = "llm-router", version, about = "Local LLM routing gateway for Claude Code")]
struct Cli {
    /// Path to config file (default: %APPDATA%/local-llm-router/config.json)
    #[arg(long, global = true)]
    config: Option<PathBuf>,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Run the gateway
    Serve {
        #[arg(long)]
        host: Option<String>,
        #[arg(long)]
        port: Option<u16>,
    },
    /// Validate config and print the resolved route table
    Validate,
    /// Print the resolved route table
    Routes,
    /// Check gateway health
    Status,
    /// Check config and probe each provider endpoint
    Doctor,
    /// Write a sample config to the default location
    Init,
    /// Open a ccswitch:// link so cc-switch imports the gateway as a Claude provider
    ImportCcswitch,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let config_path = cli.config.clone().unwrap_or_else(default_config_path);
    match cli.cmd {
        Cmd::Serve { host, port } => {
            init_tracing();
            let mut cfg = Config::load(&config_path)?;
            if let Some(h) = host {
                cfg.host = h;
            }
            if let Some(p) = port {
                cfg.port = p;
            }
            if cfg.host != "127.0.0.1" && cfg.host != "localhost" {
                eprintln!(
                    "WARNING: binding to {}. Traffic and API keys are NOT TLS-protected on a non-loopback address.",
                    cfg.host
                );
            }
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(gateway::run(cfg))?;
        }
        Cmd::Validate => {
            let cfg = Config::load(&config_path)?;
            println!("config OK: {}", config_path.display());
            print_routes(&cfg);
        }
        Cmd::Routes => {
            let cfg = Config::load(&config_path)?;
            print_routes(&cfg);
        }
        Cmd::Status => {
            let cfg = Config::load(&config_path)?;
            let url = format!("http://{}:{}/health", cfg.host, cfg.port);
            let rt = tokio::runtime::Runtime::new()?;
            match rt.block_on(async { http_client()?.get(&url).send().await }) {
                Ok(resp) => println!("gateway running at {url}: {}", resp.status()),
                Err(e) => {
                    println!("gateway not running at {url}: {e}");
                    std::process::exit(1);
                }
            }
        }
        Cmd::Doctor => {
            let cfg = Config::load(&config_path)?;
            println!("config OK: {}", config_path.display());
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(doctor(&cfg));
        }
        Cmd::Init => {
            if config_path.exists() {
                eprintln!("config already exists: {}", config_path.display());
                std::process::exit(1);
            }
            gateway::sample().save(&config_path)?;
            println!("wrote sample config to {}", config_path.display());
            println!("edit providers/routes, then run: llm-router serve");
        }
        Cmd::ImportCcswitch => {
            let cfg = Config::load(&config_path)?;
            let url = gateway::build_import_url(&cfg);
            println!("opening cc-switch import link:");
            println!("{url}");
            println!("(if cc-switch doesn't open, paste the link into a browser)");
            open_url(&url)?;
        }
    }
    Ok(())
}

fn open_url(url: &str) -> Result<(), std::io::Error> {
    #[cfg(target_os = "windows")]
    {
        // rundll32 -> ShellExecute, no cmd involved, so `&`/`%` in the URL are
        // not re-interpreted as separators / variable expansions.
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

fn http_client() -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into());
    tracing_subscriber::fmt().with_env_filter(filter).init();
}

fn print_routes(cfg: &Config) {
    for r in &cfg.routes {
        let provider = cfg.provider(&r.provider).map(|p| &p.name).unwrap_or(&r.provider);
        println!("{:<24} -> {:<24} ({})", r.model, r.provider, provider);
    }
}

async fn doctor(cfg: &Config) {
    let client = match http_client() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("failed to build http client: {e}");
            return;
        }
    };
    for p in &cfg.providers {
        let url = format!("{}/v1/models", p.base_url.trim_end_matches('/'));
        let started = Instant::now();
        let mut req = client.get(&url);
        req = match p.auth_type {
            AuthType::Bearer => req.bearer_auth(&p.api_key),
            AuthType::ApiKey => req.header("x-api-key", &p.api_key),
        };
        match req.send().await {
            Ok(r) => {
                println!(
                    "{:<10} {}  status={} latency={}ms",
                    p.id,
                    url,
                    r.status(),
                    started.elapsed().as_millis()
                );
            }
            Err(e) => println!("{:<10} {}  ERROR: {e}", p.id, url),
        }
    }
}
