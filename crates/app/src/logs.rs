use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

/// Ring buffer of the most recent formatted log lines, exposed to the UI.
pub type LogBuffer = Arc<Mutex<VecDeque<String>>>;

pub struct RingWriter(pub LogBuffer);

impl std::io::Write for RingWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let text = String::from_utf8_lossy(buf);
        let mut logs = self.0.lock().unwrap();
        for line in text.lines() {
            if !line.trim().is_empty() {
                logs.push_back(line.to_string());
            }
        }
        while logs.len() > 1000 {
            logs.pop_front();
        }
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Install the global tracing subscriber so gateway logs are captured into the
/// ring buffer (the fmt layer formats each event into a line).
pub fn setup() -> LogBuffer {
    let buf: LogBuffer = Arc::new(Mutex::new(VecDeque::new()));
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info".into());
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer({
            let buf = buf.clone();
            move || RingWriter(buf.clone())
        })
        .init();
    buf
}
