use gateway::{Config, ServerError};
use std::sync::Mutex;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

/// Runs the embedded gateway on the Tauri async runtime. There is no on/off
/// switch in the UI — the gateway starts with the app. `get_status` probes the
/// port over HTTP, so an externally-running gateway (started via the CLI) is
/// reported as up too.
pub struct GatewayHost {
    inner: Mutex<Option<Running>>,
}

struct Running {
    handle: JoinHandle<Result<(), ServerError>>,
    shutdown: oneshot::Sender<()>,
}

impl Default for GatewayHost {
    fn default() -> Self {
        Self::new()
    }
}

impl GatewayHost {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    pub fn is_running(&self) -> bool {
        self.inner
            .lock()
            .unwrap()
            .as_ref()
            .map(|r| !r.handle.is_finished())
            .unwrap_or(false)
    }

    /// Start the embedded gateway. No-op if already running. Must be called
    /// from an async context (a Tauri command) so `tokio::spawn` has a runtime.
    pub fn start(&self, cfg: Config) -> Result<(), String> {
        let mut guard = self.inner.lock().unwrap();
        if let Some(r) = guard.as_ref() {
            if !r.handle.is_finished() {
                return Ok(());
            }
        }
        let (tx, rx) = oneshot::channel::<()>();
        let handle = tokio::spawn(gateway::serve_until(cfg, async move {
            let _ = rx.await;
        }));
        *guard = Some(Running { handle, shutdown: tx });
        Ok(())
    }

    pub fn stop(&self) {
        let shutdown = self.inner.lock().unwrap().take().map(|r| r.shutdown);
        if let Some(tx) = shutdown {
            let _ = tx.send(());
        }
    }
}
